package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/ruchess/p2p_poc/stockfish-worker/internal/engine"
)

type Handler struct {
	analyzer *engine.Analyzer
}

func New(analyzer *engine.Analyzer) *Handler {
	return &Handler{analyzer: analyzer}
}

type analyzeRequest struct {
	FEN   string `json:"fen"`
	Depth int    `json:"depth"`
}

type analyzeGameRequest struct {
	Moves []string `json:"moves"`
	Depth int      `json:"depth"`
}

type analyzeGameResponse struct {
	Analyses []engine.AnalysisResult `json:"analyses"`
}

type healthResponse struct {
	Status string `json:"status"`
}

type errorResponse struct {
	Error string `json:"error"`
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}

func (h *Handler) Analyze(w http.ResponseWriter, r *http.Request) {
	var req analyzeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}

	if req.FEN == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "fen is required"})
		return
	}
	if req.Depth <= 0 {
		req.Depth = 12
	}

	result, err := h.analyzer.AnalyzePosition(req.FEN, req.Depth)
	if err != nil {
		log.Printf("[Handler] AnalyzePosition error: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) AnalyzeGame(w http.ResponseWriter, r *http.Request) {
	var req analyzeGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}

	if len(req.Moves) == 0 {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "moves is required and must not be empty"})
		return
	}
	if req.Depth <= 0 {
		req.Depth = 16
	}

	results, err := h.analyzer.AnalyzeGameSync(req.Moves, req.Depth)
	if err != nil {
		log.Printf("[Handler] AnalyzeGameSync error: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, analyzeGameResponse{Analyses: results})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("[Handler] Failed to write response: %v", err)
	}
}
