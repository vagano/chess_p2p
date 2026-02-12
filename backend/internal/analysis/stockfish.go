package analysis

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	chesslib "github.com/corentings/chess/v2"
	"github.com/corentings/chess/v2/uci"
	"github.com/google/uuid"

	"github.com/ruchess/p2p_poc/backend/internal/storage"
)

// AnalysisResult holds the analysis of a single position.
type AnalysisResult struct {
	MoveNumber int
	FEN        string
	ScoreCp    int
	IsMate     bool
	MateIn     int
	BestMove   string
	PV         string
	WinPct     float32
	DrawPct    float32
	LossPct    float32
	Depth      int
}

// Analyzer manages Stockfish analysis.
type Analyzer struct {
	enginePath string
	engine     *uci.Engine
	mu         sync.Mutex
	store      *storage.PostgresStore
}

// NewAnalyzer creates a new Analyzer with the given Stockfish path.
func NewAnalyzer(stockfishPath string, store *storage.PostgresStore) (*Analyzer, error) {
	eng, err := uci.New(stockfishPath)
	if err != nil {
		return nil, fmt.Errorf("failed to start stockfish: %w", err)
	}

	err = eng.Run(uci.CmdUCI, uci.CmdIsReady, uci.CmdUCINewGame)
	if err != nil {
		eng.Close()
		return nil, fmt.Errorf("failed to initialize UCI: %w", err)
	}

	return &Analyzer{
		enginePath: stockfishPath,
		engine:     eng,
		store:      store,
	}, nil
}

// Close shuts down the Stockfish engine.
func (a *Analyzer) Close() {
	if a.engine != nil {
		a.engine.Close()
	}
}

// AnalyzePosition performs a quick analysis of a single position.
func (a *Analyzer) AnalyzePosition(fen string, depth int) (*AnalysisResult, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	fenFunc, err := chesslib.FEN(fen)
	if err != nil {
		return nil, fmt.Errorf("invalid FEN: %w", err)
	}

	game := chesslib.NewGame(fenFunc)
	pos := game.Position()

	cmdPos := uci.CmdPosition{Position: pos}
	cmdGo := uci.CmdGo{Depth: depth}

	if err := a.engine.Run(cmdPos, cmdGo); err != nil {
		return nil, fmt.Errorf("engine analysis failed: %w", err)
	}

	sr := a.engine.SearchResults()
	info := sr.Info

	result := &AnalysisResult{
		FEN:   fen,
		Depth: info.Depth,
	}

	// Best move
	if sr.BestMove != nil {
		result.BestMove = sr.BestMove.S1().String() + sr.BestMove.S2().String()
		if sr.BestMove.Promo() != chesslib.NoPieceType {
			result.BestMove += strings.ToLower(sr.BestMove.Promo().String())
		}
	}

	// Score
	score := info.Score
	if score.Mate != 0 {
		result.IsMate = true
		result.MateIn = score.Mate
		if score.Mate > 0 {
			result.ScoreCp = 10000 // Large positive for white mate
		} else {
			result.ScoreCp = -10000
		}
	} else {
		result.ScoreCp = score.CP
	}

	// WDL
	if winPct, err := score.WinPct(); err == nil {
		result.WinPct = winPct
	}
	if drawPct, err := score.DrawPct(); err == nil {
		result.DrawPct = drawPct
	}
	if lossPct, err := score.LossPct(); err == nil {
		result.LossPct = lossPct
	}

	// PV
	pvMoves := make([]string, 0, len(info.PV))
	for _, m := range info.PV {
		moveStr := m.S1().String() + m.S2().String()
		if m.Promo() != chesslib.NoPieceType {
			moveStr += strings.ToLower(m.Promo().String())
		}
		pvMoves = append(pvMoves, moveStr)
	}
	result.PV = strings.Join(pvMoves, " ")

	return result, nil
}

// AnalyzeGameAsync performs full game analysis in background.
func (a *Analyzer) AnalyzeGameAsync(gameID uuid.UUID, fens []string, depth int) {
	go func() {
		log.Printf("[Analysis] Starting analysis for game %s (%d positions, depth %d)", gameID, len(fens), depth)
		start := time.Now()

		var prevScore int
		for i, fen := range fens {
			result, err := a.AnalyzePosition(fen, depth)
			if err != nil {
				log.Printf("[Analysis] Error analyzing move %d: %v", i, err)
				continue
			}

			result.MoveNumber = i + 1

			// Classify the move
			classification := ClassifyMove(prevScore, result.ScoreCp, result.BestMove, i)
			prevScore = result.ScoreCp

			// Save to DB
			if a.store != nil {
				mateIn := &result.MateIn
				if !result.IsMate {
					mateIn = nil
				}
				ma := &storage.MoveAnalysis{
					GameID:         gameID,
					MoveNumber:     result.MoveNumber,
					FEN:            result.FEN,
					ScoreCp:        result.ScoreCp,
					IsMate:         result.IsMate,
					MateIn:         mateIn,
					BestMove:       result.BestMove,
					PV:             result.PV,
					WinPct:         result.WinPct,
					DrawPct:        result.DrawPct,
					LossPct:        result.LossPct,
					Depth:          result.Depth,
					Classification: classification,
				}
				if err := a.store.SaveMoveAnalysis(nil, ma); err != nil {
					log.Printf("[Analysis] Error saving analysis for move %d: %v", i, err)
				}
			}
		}

		log.Printf("[Analysis] Completed game %s in %v", gameID, time.Since(start))
	}()
}
