package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	ycrdt "github.com/skyterra/y-crdt"

	"github.com/ruchess/p2p_poc/backend/internal/analysis"
	"github.com/ruchess/p2p_poc/backend/internal/auth"
	"github.com/ruchess/p2p_poc/backend/internal/bot"
	chessvalidator "github.com/ruchess/p2p_poc/backend/internal/chess"
	"github.com/ruchess/p2p_poc/backend/internal/middleware"
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
	tgBotToken := getEnv("TELEGRAM_BOT_TOKEN", "")
	skipTgAuth := getEnv("SKIP_TG_AUTH", "true") == "true"
	tgWebAppURL := getEnv("TELEGRAM_WEBAPP_URL", "")
	tgWebhookURL := getEnv("TELEGRAM_WEBHOOK_URL", "")

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

	// Telegram auth
	tgAuth := auth.NewTelegramAuth(tgBotToken, skipTgAuth)
	if skipTgAuth {
		log.Println("[Auth] Telegram auth DISABLED (SKIP_TG_AUTH=true)")
	} else if tgBotToken == "" {
		log.Println("[Auth] Telegram auth DISABLED (no TELEGRAM_BOT_TOKEN)")
	} else {
		log.Println("[Auth] Telegram auth ENABLED")
	}

	// Rate limiting
	rlConf := middleware.LoadRateLimitConfig()
	evalLimiter := middleware.NewRateLimiter(rlConf.EvaluateRPS, rlConf.EvaluateBurst, rlConf.Enabled)
	apiLimiter := middleware.NewRateLimitForRPM(rlConf.APIRPM, rlConf.APIBurst, rlConf.Enabled)
	if rlConf.Enabled {
		log.Printf("[RateLimit] ENABLED (eval: %.1f rps burst %d, api: %.0f rpm burst %d, ws: %.0f mps burst %d)",
			rlConf.EvaluateRPS, rlConf.EvaluateBurst, rlConf.APIRPM, rlConf.APIBurst, rlConf.WSMessagesPS, rlConf.WSBurst)
	} else {
		log.Println("[RateLimit] DISABLED")
	}

	// Store WS rate limit config in the handler for per-connection limiting
	wsHandler.WSRateLimitMPS = rlConf.WSMessagesPS
	wsHandler.WSRateLimitBurst = rlConf.WSBurst
	wsHandler.RateLimitEnabled = rlConf.Enabled

	// HTTP routes
	mux := http.NewServeMux()

	// y-websocket endpoint (public — CRDT sync is self-validating)
	mux.Handle("/ws/", http.HandlerFunc(wsHandler.HandleYjsWS))

	// WebRTC signaling endpoint (public — only relays SDP/ICE)
	mux.Handle("/signaling", http.HandlerFunc(sigHandler.HandleSignaling))

	// REST API (protected + rate limited)
	mux.Handle("/api/room/", apiLimiter.Middleware(tgAuth.Middleware(http.HandlerFunc(handleRoomAPI(store))), rlConf.TrustProxy))
	mux.Handle("/api/game/", apiLimiter.Middleware(tgAuth.Middleware(http.HandlerFunc(handleGameAPI(store))), rlConf.TrustProxy))
	mux.Handle("/api/evaluate", evalLimiter.Middleware(tgAuth.Middleware(http.HandlerFunc(handleEvaluateAPI(analyzer))), rlConf.TrustProxy))

	// Health check (public)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "ok",
			"rooms":     roomManager.RoomCount(),
			"db":        store != nil,
			"stockfish": analyzer != nil,
		})
	})

	// Telegram Bot webhook (verified internally via secret token)
	botHandler := bot.NewHandler(tgBotToken, tgWebAppURL, tgWebhookURL)
	mux.HandleFunc("/bot/webhook", botHandler.HandleWebhook)

	// Setup webhook on startup (non-blocking)
	if tgBotToken != "" && tgWebhookURL != "" {
		go func() {
			if err := botHandler.SetupWebhook(); err != nil {
				log.Printf("[Bot] Failed to setup webhook: %v", err)
			}
		}()
	}

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
	gameMapRaw := doc.GetMap("game")
	if gameMapRaw == nil {
		return
	}
	gameMap, ok := gameMapRaw.(*ycrdt.YMap)
	if !ok {
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
			log.Printf("[Validation] Invalid moves in room %s: %v — rolling back last move", roomID, err)

			// CRDT rollback: remove the invalid last move and restore valid state
			doc.Transact(func(trans *ycrdt.Transaction) {
				if len(moves) > 1 {
					validMoves := moves[:len(moves)-1]
					rollbackFEN, rollbackErr := validator.ValidateMoves(validMoves)
					if rollbackErr == nil {
						gameMap.Set("moves", toInterfaceSlice(validMoves))
						gameMap.Set("fen", rollbackFEN)
						log.Printf("[Validation] Rolled back to %d moves in room %s", len(validMoves), roomID)
					}
				} else {
					gameMap.Set("moves", []interface{}{})
					gameMap.Set("fen", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
					log.Printf("[Validation] Rolled back to initial position in room %s", roomID)
				}
			}, nil)
			return
		}

		// Cross-check FEN — correct via CRDT update
		if validFEN != fen && fen != "" {
			log.Printf("[Validation] FEN mismatch in room %s: expected %s, got %s — correcting", roomID, validFEN, fen)
			doc.Transact(func(trans *ycrdt.Transaction) {
				gameMap.Set("fen", validFEN)
			}, nil)
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

		if !middleware.ValidateFEN(fen) {
			http.Error(w, `{"error":"invalid fen format"}`, http.StatusBadRequest)
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
	allowedOrigins := getEnv("CORS_ORIGINS", "")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowedOrigins == "*" || allowedOrigins == "" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if origin == frontendURL || strings.Contains(allowedOrigins, origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			w.Header().Set("Access-Control-Allow-Origin", frontendURL)
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

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

func toInterfaceSlice(ss []string) []interface{} {
	result := make([]interface{}, len(ss))
	for i, s := range ss {
		result[i] = s
	}
	return result
}
