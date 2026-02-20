package engine

import "math"

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
// moveIndex: 0-based index of the move
func ClassifyMove(prevScore, currScore int, bestMove string, moveIndex int) string {
	isBlackMove := moveIndex%2 == 1

	var delta int
	if isBlackMove {
		delta = currScore - prevScore
	} else {
		delta = prevScore - currScore
	}

	absDelta := int(math.Abs(float64(delta)))

	switch {
	case delta < -20:
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
