package analysis

// AnalysisResult holds the analysis of a single position.
type AnalysisResult struct {
	MoveNumber int     `json:"moveNumber"`
	FEN        string  `json:"fen"`
	ScoreCp    int     `json:"scoreCp"`
	IsMate     bool    `json:"isMate"`
	MateIn     int     `json:"mateIn"`
	BestMove   string  `json:"bestMove"`
	PV         string  `json:"pv"`
	WinPct     float32 `json:"winPct"`
	DrawPct    float32 `json:"drawPct"`
	LossPct    float32 `json:"lossPct"`
	Depth      int     `json:"depth"`
}

// MoveAnalysis holds analysis for a single move in a game.
type MoveAnalysis struct {
	MoveNumber     int     `json:"moveNumber"`
	FEN            string  `json:"fen"`
	ScoreCp        int     `json:"scoreCp"`
	IsMate         bool    `json:"isMate"`
	MateIn         int     `json:"mateIn"`
	BestMove       string  `json:"bestMove"`
	PV             string  `json:"pv"`
	WinPct         float32 `json:"winPct"`
	DrawPct        float32 `json:"drawPct"`
	LossPct        float32 `json:"lossPct"`
	Depth          int     `json:"depth"`
	Classification string  `json:"classification"`
}
