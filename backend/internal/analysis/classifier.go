package analysis

import "math"

// Classification constants for chess moves.
const (
	Brilliant  = "brilliant"
	Great      = "great"
	Best       = "best"
	Good       = "good"
	Inaccuracy = "inaccuracy"
	Mistake    = "mistake"
	Blunder    = "blunder"
)

// ClassifyMove classifies a chess move based on evaluation change.
// prevScore: evaluation before the move (in centipawns, from white's perspective)
// currScore: evaluation after the move (in centipawns, from white's perspective)
// bestMove: the best move according to Stockfish
// moveIndex: 0-based index of the move
func ClassifyMove(prevScore, currScore int, bestMove string, moveIndex int) string {
	// For black's moves, invert the delta logic
	isBlackMove := moveIndex%2 == 1

	var delta int
	if isBlackMove {
		// For black, a decrease in score (from white's perspective) is good
		delta = currScore - prevScore // positive = bad for black
	} else {
		// For white, an increase in score is good
		delta = prevScore - currScore // positive = bad for white (loss)
	}

	absDelta := int(math.Abs(float64(delta)))

	// Classify based on centipawn loss
	switch {
	case delta < -20:
		// Move improved position beyond expectations
		return Brilliant
	case absDelta <= 10:
		return Best
	case absDelta <= 30:
		return Good
	case absDelta <= 100:
		return Inaccuracy
	case absDelta <= 300:
		return Mistake
	default:
		return Blunder
	}
}
