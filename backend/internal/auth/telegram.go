package auth

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	initdata "github.com/telegram-mini-apps/init-data-golang"
)

type contextKey string

const TelegramUserIDKey contextKey = "tg_user_id"

// TelegramAuth validates Telegram Mini App initData.
type TelegramAuth struct {
	BotToken   string
	SkipAuth   bool
	Expiration time.Duration
}

// NewTelegramAuth creates a new auth handler.
// If botToken is empty or skipAuth is true, all requests pass through (dev mode).
func NewTelegramAuth(botToken string, skipAuth bool) *TelegramAuth {
	return &TelegramAuth{
		BotToken:   botToken,
		SkipAuth:   skipAuth,
		Expiration: 24 * time.Hour,
	}
}

// Middleware returns an HTTP middleware that validates Telegram initData.
// initData is expected in the Authorization header: "tma <initData>"
func (a *TelegramAuth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if a.SkipAuth || a.BotToken == "" {
			next.ServeHTTP(w, r)
			return
		}

		raw := extractInitData(r)
		if raw == "" {
			http.Error(w, `{"error":"authorization required"}`, http.StatusUnauthorized)
			return
		}

		if err := initdata.Validate(raw, a.BotToken, a.Expiration); err != nil {
			log.Printf("[Auth] initData validation failed: %v", err)
			http.Error(w, `{"error":"invalid authorization"}`, http.StatusUnauthorized)
			return
		}

		parsed, err := initdata.Parse(raw)
		if err != nil {
			http.Error(w, `{"error":"invalid init data format"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), TelegramUserIDKey, parsed.User.ID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// extractInitData reads initData from Authorization header ("tma <data>")
// or from a query parameter "initData".
func extractInitData(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "tma ") {
		return strings.TrimPrefix(auth, "tma ")
	}

	if q := r.URL.Query().Get("initData"); q != "" {
		return q
	}

	return ""
}

// GetUserID extracts the Telegram user ID from the request context.
// Returns 0 if not present (e.g., in dev/skip-auth mode).
func GetUserID(ctx context.Context) int64 {
	if id, ok := ctx.Value(TelegramUserIDKey).(int64); ok {
		return id
	}
	return 0
}
