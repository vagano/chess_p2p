package chess

import (
	"fmt"
	"strings"

	chesslib "github.com/corentings/chess/v2"
)

// Validator validates chess moves on the server side.
type Validator struct{}

func NewValidator() *Validator {
	return &Validator{}
}

// ValidatePosition checks if a FEN string represents a valid position.
func (v *Validator) ValidatePosition(fen string) error {
	fenFunc, err := chesslib.FEN(fen)
	if err != nil {
		return fmt.Errorf("invalid FEN: %w", err)
	}

	game := chesslib.NewGame(fenFunc)
	if game == nil {
		return fmt.Errorf("failed to create game from FEN")
	}

	return nil
}

// ValidateMoves validates a sequence of UCI moves from the starting position.
// Returns the final FEN and any error.
func (v *Validator) ValidateMoves(moves []string) (string, error) {
	game := chesslib.NewGame()

	for i, moveStr := range moves {
		// Parse UCI notation (e.g., "e2e4", "e7e5", "e1g1" for castling)
		if len(moveStr) < 4 {
			return "", fmt.Errorf("invalid move format at index %d: %s", i, moveStr)
		}

		// Find matching legal move
		legalMoves := game.ValidMoves()
		var found *chesslib.Move
		for j := range legalMoves {
			m := &legalMoves[j]
			uci := m.S1().String() + m.S2().String()
			if m.Promo() != chesslib.NoPieceType {
				uci += strings.ToLower(m.Promo().String())
			}
			if uci == moveStr {
				found = m
				break
			}
		}

		if found == nil {
			return "", fmt.Errorf("illegal move at index %d: %s (position: %s)", i, moveStr, game.FEN())
		}

		err := game.Move(found, nil)
		if err != nil {
			return "", fmt.Errorf("failed to apply move at index %d: %w", i, err)
		}
	}

	return game.FEN(), nil
}

// ValidateLastMove validates that the last move in a sequence is legal.
// prevFEN is the position before the move, moveUCI is the move in UCI notation.
func (v *Validator) ValidateLastMove(prevFEN string, moveUCI string) error {
	fenFunc, err := chesslib.FEN(prevFEN)
	if err != nil {
		return fmt.Errorf("invalid previous FEN: %w", err)
	}

	game := chesslib.NewGame(fenFunc)

	legalMoves := game.ValidMoves()
	for j := range legalMoves {
		m := &legalMoves[j]
		uci := m.S1().String() + m.S2().String()
		if m.Promo() != chesslib.NoPieceType {
			uci += strings.ToLower(m.Promo().String())
		}
		if uci == moveUCI {
			return nil // Move is legal
		}
	}

	return fmt.Errorf("illegal move: %s in position %s", moveUCI, prevFEN)
}

// GetGameOutcome returns the game outcome for the given position.
func (v *Validator) GetGameOutcome(fen string) (outcome string, method string) {
	fenFunc, err := chesslib.FEN(fen)
	if err != nil {
		return "*", ""
	}

	game := chesslib.NewGame(fenFunc)
	o := game.Outcome()

	switch o {
	case chesslib.WhiteWon:
		return "1-0", game.Method().String()
	case chesslib.BlackWon:
		return "0-1", game.Method().String()
	case chesslib.Draw:
		return "1/2-1/2", game.Method().String()
	default:
		return "*", ""
	}
}
