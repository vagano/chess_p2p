package analysis

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Client communicates with an external Stockfish worker over HTTP.
type Client struct {
	workerURL  string
	httpClient *http.Client
}

// NewClient creates a new analysis client pointing at the given worker URL.
func NewClient(workerURL string) *Client {
	return &Client{
		workerURL: workerURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// AnalyzePosition sends a single position to the worker for evaluation.
func (c *Client) AnalyzePosition(fen string, depth int) (*AnalysisResult, error) {
	body, err := json.Marshal(map[string]interface{}{
		"fen":   fen,
		"depth": depth,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.httpClient.Post(c.workerURL+"/analyze", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("worker request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("worker returned status %d", resp.StatusCode)
	}

	var result AnalysisResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// AnalyzeGame sends a full game (as a list of UCI moves) to the worker.
func (c *Client) AnalyzeGame(moves []string, depth int) ([]MoveAnalysis, error) {
	body, err := json.Marshal(map[string]interface{}{
		"moves": moves,
		"depth": depth,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := c.httpClient.Post(c.workerURL+"/analyze-game", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("worker request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("worker returned status %d", resp.StatusCode)
	}

	var result []MoveAnalysis
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return result, nil
}

// IsAvailable checks if the worker is healthy.
func (c *Client) IsAvailable() bool {
	resp, err := c.httpClient.Get(c.workerURL + "/health")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}
