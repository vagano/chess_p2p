package storage

import (
	"context"
	"fmt"
)

const migrationsSQL = `
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    result VARCHAR(10) DEFAULT '*',
    fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    pgn TEXT DEFAULT '',
    white_id VARCHAR(64),
    black_id VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS yjs_snapshots (
    game_id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
    snapshot BYTEA NOT NULL,
    state_vector BYTEA NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS move_analysis (
    id SERIAL PRIMARY KEY,
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    move_number INT NOT NULL,
    fen TEXT NOT NULL,
    score_cp INT,
    is_mate BOOLEAN DEFAULT FALSE,
    mate_in INT,
    best_move VARCHAR(10),
    pv TEXT,
    win_pct REAL,
    draw_pct REAL,
    loss_pct REAL,
    depth INT,
    classification VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_move_analysis_game_id ON move_analysis(game_id);
`

func (s *PostgresStore) RunMigrations(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, migrationsSQL)
	if err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}
	return nil
}
