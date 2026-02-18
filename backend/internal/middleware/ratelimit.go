package middleware

import (
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// RateLimitConfig holds configurable rate limit parameters.
type RateLimitConfig struct {
	Enabled        bool
	EvaluateRPS    float64
	EvaluateBurst  int
	APIRPM         float64
	APIBurst       int
	WSMessagesPS   float64
	WSBurst        int
	TrustProxy     bool
}

// LoadRateLimitConfig reads rate limit configuration from environment variables.
func LoadRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		Enabled:       envBool("RATE_LIMIT_ENABLED", true),
		EvaluateRPS:   envFloat("RATE_LIMIT_EVALUATE_RPS", 2),
		EvaluateBurst: envInt("RATE_LIMIT_EVALUATE_BURST", 5),
		APIRPM:        envFloat("RATE_LIMIT_API_RPM", 60),
		APIBurst:      envInt("RATE_LIMIT_API_BURST", 10),
		WSMessagesPS:  envFloat("RATE_LIMIT_WS_MPS", 10),
		WSBurst:       envInt("RATE_LIMIT_WS_BURST", 20),
		TrustProxy:    envBool("TRUST_PROXY", false),
	}
}

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// RateLimiter is a per-key token bucket rate limiter with TTL cleanup.
type RateLimiter struct {
	mu       sync.RWMutex
	visitors map[string]*visitor
	rps      rate.Limit
	burst    int
	enabled  bool
}

func NewRateLimiter(rps float64, burst int, enabled bool) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		rps:      rate.Limit(rps),
		burst:    burst,
		enabled:  enabled,
	}

	go rl.cleanup()
	return rl
}

func (rl *RateLimiter) getVisitor(key string) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, exists := rl.visitors[key]
	if !exists {
		limiter := rate.NewLimiter(rl.rps, rl.burst)
		rl.visitors[key] = &visitor{limiter: limiter, lastSeen: time.Now()}
		return limiter
	}
	v.lastSeen = time.Now()
	return v.limiter
}

func (rl *RateLimiter) cleanup() {
	for {
		time.Sleep(5 * time.Minute)
		rl.mu.Lock()
		for key, v := range rl.visitors {
			if time.Since(v.lastSeen) > 10*time.Minute {
				delete(rl.visitors, key)
			}
		}
		rl.mu.Unlock()
	}
}

// Allow checks if the key is within rate limits.
func (rl *RateLimiter) Allow(key string) bool {
	if !rl.enabled {
		return true
	}
	return rl.getVisitor(key).Allow()
}

// Middleware returns an HTTP middleware that rate limits by client IP.
func (rl *RateLimiter) Middleware(next http.Handler, trustProxy bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.enabled {
			next.ServeHTTP(w, r)
			return
		}

		key := clientIP(r, trustProxy)
		if !rl.Allow(key) {
			w.Header().Set("Retry-After", "1")
			http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
			log.Printf("[RateLimit] Blocked request from %s to %s", key, r.URL.Path)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// NewRateLimitForRPM creates a limiter configured in requests-per-minute.
func NewRateLimitForRPM(rpm float64, burst int, enabled bool) *RateLimiter {
	return NewRateLimiter(rpm/60.0, burst, enabled)
}

// WSRateLimiter provides per-connection WebSocket message rate limiting.
type WSRateLimiter struct {
	limiter *rate.Limiter
	enabled bool
}

func NewWSRateLimiter(mps float64, burst int, enabled bool) *WSRateLimiter {
	return &WSRateLimiter{
		limiter: rate.NewLimiter(rate.Limit(mps), burst),
		enabled: enabled,
	}
}

func (wrl *WSRateLimiter) Allow() bool {
	if !wrl.enabled {
		return true
	}
	return wrl.limiter.Allow()
}

// clientIP extracts the client IP address, respecting X-Forwarded-For / X-Real-IP when behind a trusted proxy.
func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.SplitN(xff, ",", 2)
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
		if xri := r.Header.Get("X-Real-IP"); xri != "" {
			return strings.TrimSpace(xri)
		}
	}

	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// --- env helpers ---

func envBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return strings.ToLower(v) == "true" || v == "1"
}

func envFloat(key string, fallback float64) float64 {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return fallback
	}
	return f
}

func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return i
}
