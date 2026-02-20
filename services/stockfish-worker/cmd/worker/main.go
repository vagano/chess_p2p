package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ruchess/p2p_poc/stockfish-worker/internal/engine"
	"github.com/ruchess/p2p_poc/stockfish-worker/internal/handler"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "9000"
	}

	stockfishPath := os.Getenv("STOCKFISH_PATH")
	if stockfishPath == "" {
		stockfishPath = "stockfish"
	}

	analyzer, err := engine.NewAnalyzer(stockfishPath)
	if err != nil {
		log.Fatalf("Failed to initialize Stockfish engine: %v", err)
	}
	defer analyzer.Close()

	h := handler.New(analyzer)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /analyze", h.Analyze)
	mux.HandleFunc("POST /analyze-game", h.AnalyzeGame)
	mux.HandleFunc("GET /health", h.Health)

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 5 * time.Minute,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("Stockfish worker listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server stopped")
}
