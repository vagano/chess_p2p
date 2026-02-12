package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct {
	pool *pgxpool.Pool
}

func NewPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &PostgresStore{pool: pool}, nil
}

func (s *PostgresStore) Close() {
	s.pool.Close()
}

// --- Games ---

func (s *PostgresStore) CreateGame(ctx context.Context, id uuid.UUID) (*Game, error) {
	game := &Game{
		ID:        id,
		Status:    GameStatusWaiting,
		Result:    GameResultOngoing,
		FEN:       "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	_, err := s.pool.Exec(ctx,
		`INSERT INTO games (id, status, result, fen, pgn, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, '', $5, $6)
		 ON CONFLICT (id) DO NOTHING`,
		game.ID, game.Status, game.Result, game.FEN, game.CreatedAt, game.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create game: %w", err)
	}

	return game, nil
}

func (s *PostgresStore) GetGame(ctx context.Context, id uuid.UUID) (*Game, error) {
	game := &Game{}
	err := s.pool.QueryRow(ctx,
		`SELECT id, status, result, fen, pgn, white_id, black_id, created_at, updated_at
		 FROM games WHERE id = $1`, id,
	).Scan(&game.ID, &game.Status, &game.Result, &game.FEN, &game.PGN,
		&game.WhiteID, &game.BlackID, &game.CreatedAt, &game.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("game not found: %w", err)
	}
	return game, nil
}

func (s *PostgresStore) UpdateGameState(ctx context.Context, id uuid.UUID, fen, pgn string, status GameStatus, result GameResult) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE games SET fen = $2, pgn = $3, status = $4, result = $5, updated_at = NOW()
		 WHERE id = $1`,
		id, fen, pgn, status, result,
	)
	return err
}

// --- Yjs Snapshots ---

func (s *PostgresStore) SaveSnapshot(ctx context.Context, gameID uuid.UUID, snapshot, stateVector []byte) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO yjs_snapshots (game_id, snapshot, state_vector, updated_at)
		 VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (game_id)
		 DO UPDATE SET snapshot = $2, state_vector = $3, updated_at = NOW()`,
		gameID, snapshot, stateVector,
	)
	return err
}

func (s *PostgresStore) GetSnapshot(ctx context.Context, gameID uuid.UUID) (*YjsSnapshot, error) {
	snap := &YjsSnapshot{}
	err := s.pool.QueryRow(ctx,
		`SELECT game_id, snapshot, state_vector, updated_at
		 FROM yjs_snapshots WHERE game_id = $1`, gameID,
	).Scan(&snap.GameID, &snap.Snapshot, &snap.StateVector, &snap.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return snap, nil
}

// --- Move Analysis ---

func (s *PostgresStore) SaveMoveAnalysis(ctx context.Context, analysis *MoveAnalysis) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO move_analysis
		 (game_id, move_number, fen, score_cp, is_mate, mate_in, best_move, pv, win_pct, draw_pct, loss_pct, depth, classification)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
		analysis.GameID, analysis.MoveNumber, analysis.FEN, analysis.ScoreCp,
		analysis.IsMate, analysis.MateIn, analysis.BestMove, analysis.PV,
		analysis.WinPct, analysis.DrawPct, analysis.LossPct, analysis.Depth, analysis.Classification,
	)
	return err
}

func (s *PostgresStore) GetGameAnalysis(ctx context.Context, gameID uuid.UUID) ([]MoveAnalysis, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, game_id, move_number, fen, score_cp, is_mate, mate_in,
		        best_move, pv, win_pct, draw_pct, loss_pct, depth, classification, created_at
		 FROM move_analysis WHERE game_id = $1 ORDER BY move_number`, gameID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []MoveAnalysis
	for rows.Next() {
		var m MoveAnalysis
		err := rows.Scan(&m.ID, &m.GameID, &m.MoveNumber, &m.FEN, &m.ScoreCp,
			&m.IsMate, &m.MateIn, &m.BestMove, &m.PV,
			&m.WinPct, &m.DrawPct, &m.LossPct, &m.Depth, &m.Classification, &m.CreatedAt)
		if err != nil {
			return nil, err
		}
		result = append(result, m)
	}
	return result, nil
}
