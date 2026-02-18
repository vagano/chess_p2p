package middleware

import (
	"regexp"
)

var (
	fenRegex    = regexp.MustCompile(`^[rnbqkpRNBQKP1-8/]+ [wb] [KQkq-]+ [a-h1-8-]+ \d+ \d+$`)
	roomIDRegex = regexp.MustCompile(`^[A-Za-z0-9_-]{1,50}$`)
)

// ValidateFEN checks that a FEN string has a valid structure
// before passing it to Stockfish.
func ValidateFEN(fen string) bool {
	if len(fen) > 200 {
		return false
	}
	return fenRegex.MatchString(fen)
}

// ValidateRoomID checks that a room ID matches [A-Za-z0-9_-]{1,50}.
func ValidateRoomID(id string) bool {
	return roomIDRegex.MatchString(id)
}
