package storage

import (
	"time"

	"github.com/google/uuid"
)

type GameStatus string

const (
	GameStatusWaiting  GameStatus = "waiting"
	GameStatusPlaying  GameStatus = "playing"
	GameStatusFinished GameStatus = "finished"
)

type GameResult string

const (
	GameResultWhiteWins GameResult = "1-0"
	GameResultBlackWins GameResult = "0-1"
	GameResultDraw      GameResult = "1/2-1/2"
	GameResultOngoing   GameResult = "*"
)

type Game struct {
	ID        uuid.UUID  `json:"id"`
	Status    GameStatus `json:"status"`
	Result    GameResult `json:"result"`
	FEN       string     `json:"fen"`
	PGN       string     `json:"pgn"`
	WhiteID   string     `json:"white_id"`
	BlackID   string     `json:"black_id"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

type YjsSnapshot struct {
	GameID      uuid.UUID `json:"game_id"`
	Snapshot    []byte    `json:"snapshot"`
	StateVector []byte    `json:"state_vector"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type MoveAnalysis struct {
	ID             int        `json:"id"`
	GameID         uuid.UUID  `json:"game_id"`
	MoveNumber     int        `json:"move_number"`
	FEN            string     `json:"fen"`
	ScoreCp        int        `json:"score_cp"`
	IsMate         bool       `json:"is_mate"`
	MateIn         *int       `json:"mate_in"`
	BestMove       string     `json:"best_move"`
	PV             string     `json:"pv"`
	WinPct         float32    `json:"win_pct"`
	DrawPct        float32    `json:"draw_pct"`
	LossPct        float32    `json:"loss_pct"`
	Depth          int        `json:"depth"`
	Classification string     `json:"classification"`
	CreatedAt      time.Time  `json:"created_at"`
}
