package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/google/uuid"
	ycrdt "github.com/skyterra/y-crdt"

	"github.com/ruchess/p2p_poc/backend/internal/analysis"
	chessvalidator "github.com/ruchess/p2p_poc/backend/internal/chess"
	"github.com/ruchess/p2p_poc/backend/internal/room"
	"github.com/ruchess/p2p_poc/backend/internal/signaling"
	"github.com/ruchess/p2p_poc/backend/internal/storage"
	"github.com/ruchess/p2p_poc/backend/internal/ws"
)

func main() {
	ctx := context.Background()

	// Configuration from env
	port := getEnv("PORT", "8080")
	dbURL := getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/p2p_chess?sslmode=disable")
	stockfishPath := getEnv("STOCKFISH_PATH", "stockfish")
	frontendURL := getEnv("FRONTEND_URL", "http://localhost:5173")

	// Initialize storage (optional — runs without DB in dev mode)
	var store *storage.PostgresStore
	pgStore, err := storage.NewPostgresStore(ctx, dbURL)
	if err != nil {
		log.Printf("[WARN] PostgreSQL not available: %v (running without persistence)", err)
	} else {
		store = pgStore
		if err := store.RunMigrations(ctx); err != nil {
			log.Printf("[WARN] Failed to run migrations: %v", err)
		} else {
			log.Println("[DB] Migrations complete")
		}
		defer store.Close()
	}

	// Initialize chess validator
	validator := chessvalidator.NewValidator()

	// Initialize Stockfish analyzer (optional)
	var analyzer *analysis.Analyzer
	sfAnalyzer, err := analysis.NewAnalyzer(stockfishPath, store)
	if err != nil {
		log.Printf("[WARN] Stockfish not available: %v (running without analysis)", err)
	} else {
		analyzer = sfAnalyzer
		defer analyzer.Close()
		log.Println("[Stockfish] Engine ready")
	}

	// Initialize room manager
	roomManager := room.NewManager()

	// WebSocket handler with validation callback
	wsHandler := &ws.Handler{
		RoomManager: roomManager,
		Store:       store,
		OnUpdate: func(roomID uuid.UUID, doc *ycrdt.Doc) {
			handleGameUpdate(roomID, doc, validator, store, analyzer)
		},
	}

	// Signaling handler
	sigHandler := signaling.NewSignalingHandler()

	// HTTP routes
	mux := http.NewServeMux()

	// y-websocket endpoint
	mux.HandleFunc("/ws/", wsHandler.HandleYjsWS)

	// WebRTC signaling endpoint
	mux.HandleFunc("/signaling", sigHandler.HandleSignaling)

	// REST API
	mux.HandleFunc("/api/room/", handleRoomAPI(store))
	mux.HandleFunc("/api/game/", handleGameAPI(store))
	mux.HandleFunc("/api/evaluate", handleEvaluateAPI(analyzer))

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "ok",
			"rooms":     roomManager.RoomCount(),
			"db":        store != nil,
			"stockfish": analyzer != nil,
		})
	})

	// CORS middleware
	handler := corsMiddleware(mux, frontendURL)

	// Start server
	server := &http.Server{
		Addr:    ":" + port,
		Handler: handler,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh

		log.Println("[Server] Shutting down...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()

	log.Printf("[Server] Starting on :%s", port)
	log.Printf("[Server] Frontend URL: %s", frontendURL)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("[Server] Fatal: %v", err)
	}
}

func handleGameUpdate(roomID uuid.UUID, doc *ycrdt.Doc, validator *chessvalidator.Validator, store *storage.PostgresStore, analyzer *analysis.Analyzer) {
	// Extract game state from Yjs document
	gameMap := doc.GetMap("game")
	if gameMap == nil {
		return
	}

	mapData := gameMap.ToJson()
	if mapData == nil {
		return
	}

	dataMap, ok := mapData.(map[string]interface{})
	if !ok {
		return
	}

	fen, _ := dataMap["fen"].(string)
	pgn, _ := dataMap["pgn"].(string)
	status, _ := dataMap["status"].(string)
	result, _ := dataMap["result"].(string)

	// Extract moves
	var moves []string
	if movesRaw, ok := dataMap["moves"]; ok {
		if movesArr, ok := movesRaw.([]interface{}); ok {
			for _, m := range movesArr {
				if s, ok := m.(string); ok {
					moves = append(moves, s)
				}
			}
		}
	}

	// Validate moves if we have them
	if len(moves) > 0 {
		validFEN, err := validator.ValidateMoves(moves)
		if err != nil {
			log.Printf("[Validation] Invalid moves in room %s: %v", roomID, err)
			// TODO: revert the invalid move via CRDT
			return
		}

		// Cross-check FEN
		if validFEN != fen && fen != "" {
			log.Printf("[Validation] FEN mismatch in room %s: expected %s, got %s", roomID, validFEN, fen)
		}
	}

	// Persist to database
	if store != nil {
		gameStatus := storage.GameStatus(status)
		gameResult := storage.GameResult(result)
		if err := store.UpdateGameState(context.Background(), roomID, fen, pgn, gameStatus, gameResult); err != nil {
			log.Printf("[Storage] Failed to update game state: %v", err)
		}
	}

	// Trigger analysis on game completion
	if status == "finished" && analyzer != nil {
		// Collect FENs for analysis
		fens := collectFENsFromMoves(moves)
		if len(fens) > 0 {
			analyzer.AnalyzeGameAsync(roomID, fens, 20)
		}
	}
}

func collectFENsFromMoves(moves []string) []string {
	if len(moves) == 0 {
		return nil
	}

	validator := chessvalidator.NewValidator()
	var fens []string

	// Replay moves and collect FENs
	for i := 1; i <= len(moves); i++ {
		fen, err := validator.ValidateMoves(moves[:i])
		if err != nil {
			break
		}
		fens = append(fens, fen)
	}

	return fens
}

func handleRoomAPI(store *storage.PostgresStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Extract room ID from path: /api/room/{id}
		roomIDStr := r.URL.Path[len("/api/room/"):]
		if roomIDStr == "" {
			http.Error(w, `{"error":"room id required"}`, http.StatusBadRequest)
			return
		}

		roomID, err := uuid.Parse(roomIDStr)
		if err != nil {
			roomID = uuid.NewSHA1(uuid.NameSpaceURL, []byte(roomIDStr))
		}

		if store == nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"id":     roomID,
				"exists": false,
			})
			return
		}

		game, err := store.GetGame(r.Context(), roomID)
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"id":     roomID,
				"exists": false,
			})
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":     game.ID,
			"exists": true,
			"game":   game,
		})
	}
}

func handleGameAPI(store *storage.PostgresStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Routes: /api/game/{id}/analysis
		path := r.URL.Path[len("/api/game/"):]
		parts := splitPath(path)

		if len(parts) < 2 {
			http.Error(w, `{"error":"invalid path"}`, http.StatusBadRequest)
			return
		}

		gameIDStr := parts[0]
		action := parts[1]

		gameID, err := uuid.Parse(gameIDStr)
		if err != nil {
			gameID = uuid.NewSHA1(uuid.NameSpaceURL, []byte(gameIDStr))
		}

		switch action {
		case "analysis":
			if store == nil {
				json.NewEncoder(w).Encode(map[string]interface{}{"moves": []interface{}{}})
				return
			}

			analyses, err := store.GetGameAnalysis(r.Context(), gameID)
			if err != nil {
				json.NewEncoder(w).Encode(map[string]interface{}{"moves": []interface{}{}})
				return
			}

			json.NewEncoder(w).Encode(map[string]interface{}{"moves": analyses})
		default:
			http.Error(w, `{"error":"unknown action"}`, http.StatusNotFound)
		}
	}
}

func splitPath(path string) []string {
	var parts []string
	for _, p := range split(path, '/') {
		if p != "" {
			parts = append(parts, p)
		}
	}
	return parts
}

func split(s string, sep byte) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	result = append(result, s[start:])
	return result
}

// handleEvaluateAPI — quick Stockfish evaluation for a single position.
// GET /api/evaluate?fen=<FEN>&depth=<depth>
func handleEvaluateAPI(analyzer *analysis.Analyzer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if analyzer == nil {
			http.Error(w, `{"error":"stockfish not available"}`, http.StatusServiceUnavailable)
			return
		}

		fen := r.URL.Query().Get("fen")
		if fen == "" {
			http.Error(w, `{"error":"fen parameter required"}`, http.StatusBadRequest)
			return
		}

		// Use low depth for quick response (default 12, max 18)
		depth := 12
		if d := r.URL.Query().Get("depth"); d != "" {
			if _, err := fmt.Sscanf(d, "%d", &depth); err != nil || depth < 1 {
				depth = 12
			}
			if depth > 18 {
				depth = 18
			}
		}

		result, err := analyzer.AnalyzePosition(fen, depth)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"scoreCp":  result.ScoreCp,
			"isMate":   result.IsMate,
			"mateIn":   result.MateIn,
			"bestMove": result.BestMove,
			"pv":       result.PV,
			"depth":    result.Depth,
			"winPct":   result.WinPct,
			"drawPct":  result.DrawPct,
			"lossPct":  result.LossPct,
		})
	}
}

func corsMiddleware(next http.Handler, frontendURL string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

// Unused import guard
var _ = fmt.Sprint
