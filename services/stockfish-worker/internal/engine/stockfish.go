package engine

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	chesslib "github.com/corentings/chess/v2"
	"github.com/corentings/chess/v2/uci"
)

type AnalysisResult struct {
	MoveNumber     int     `json:"move_number"`
	FEN            string  `json:"fen"`
	ScoreCp        int     `json:"score_cp"`
	IsMate         bool    `json:"is_mate"`
	MateIn         int     `json:"mate_in,omitempty"`
	BestMove       string  `json:"best_move"`
	PV             string  `json:"pv"`
	WinPct         float32 `json:"win_pct"`
	DrawPct        float32 `json:"draw_pct"`
	LossPct        float32 `json:"loss_pct"`
	Depth          int     `json:"depth"`
	Classification string  `json:"classification,omitempty"`
}

type Analyzer struct {
	enginePath string
	engine     *uci.Engine
	mu         sync.Mutex
}

func NewAnalyzer(stockfishPath string) (*Analyzer, error) {
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
	}, nil
}

func (a *Analyzer) Close() {
	if a.engine != nil {
		a.engine.Close()
	}
}

// AnalyzePosition performs analysis of a single FEN position.
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

	if sr.BestMove != nil {
		result.BestMove = sr.BestMove.S1().String() + sr.BestMove.S2().String()
		if sr.BestMove.Promo() != chesslib.NoPieceType {
			result.BestMove += strings.ToLower(sr.BestMove.Promo().String())
		}
	}

	score := info.Score
	if score.Mate != 0 {
		result.IsMate = true
		result.MateIn = score.Mate
		if score.Mate > 0 {
			result.ScoreCp = 10000
		} else {
			result.ScoreCp = -10000
		}
	} else {
		result.ScoreCp = score.CP
	}

	if winPct, err := score.WinPct(); err == nil {
		result.WinPct = winPct
	}
	if drawPct, err := score.DrawPct(); err == nil {
		result.DrawPct = drawPct
	}
	if lossPct, err := score.LossPct(); err == nil {
		result.LossPct = lossPct
	}

	pvMoves := make([]string, 0, len(info.PV))
	for _, m := range info.PV {
		moveStr := m.S1().String() + m.S2().String()
		if m.Promo() != chesslib.NoPieceType {
			moveStr += strings.ToLower(m.Promo().String())
		}
		pvMoves = append(pvMoves, moveStr)
	}
	result.PV = strings.Join(pvMoves, " ")

	scoreStr := fmt.Sprintf("%+.2f", float64(result.ScoreCp)/100.0)
	if result.IsMate {
		scoreStr = fmt.Sprintf("M%d", result.MateIn)
	}
	wdl := fmt.Sprintf("W:%.0f%% D:%.0f%% L:%.0f%%", result.WinPct*100, result.DrawPct*100, result.LossPct*100)
	log.Printf("[Stockfish] depth=%d score=%s best=%s pv=%s %s", result.Depth, scoreStr, result.BestMove, result.PV, wdl)

	return result, nil
}

// AnalyzeGameSync performs full game analysis synchronously, returning all results.
func (a *Analyzer) AnalyzeGameSync(fens []string, depth int) ([]AnalysisResult, error) {
	log.Printf("[Analysis] Starting analysis (%d positions, depth %d)", len(fens), depth)
	start := time.Now()

	results := make([]AnalysisResult, 0, len(fens))
	var prevScore int

	for i, fen := range fens {
		result, err := a.AnalyzePosition(fen, depth)
		if err != nil {
			return nil, fmt.Errorf("error analyzing position %d: %w", i, err)
		}

		result.MoveNumber = i + 1
		result.Classification = ClassifyMove(prevScore, result.ScoreCp, result.BestMove, i)

		side := "W"
		if i%2 == 1 {
			side = "B"
		}
		moveNum := (i / 2) + 1
		scoreStr := fmt.Sprintf("%+.2f", float64(result.ScoreCp)/100.0)
		if result.IsMate {
			scoreStr = fmt.Sprintf("M%d", result.MateIn)
		}
		log.Printf("[Analysis] %d.%s score=%s best=%s class=%s",
			moveNum, side, scoreStr, result.BestMove, result.Classification)

		prevScore = result.ScoreCp
		results = append(results, *result)
	}

	log.Printf("[Analysis] Completed %d positions in %v", len(fens), time.Since(start))
	return results, nil
}
