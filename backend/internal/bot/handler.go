package bot

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
)

// Update represents a Telegram Bot API Update.
type Update struct {
	UpdateID    int64        `json:"update_id"`
	Message     *Message     `json:"message,omitempty"`
	InlineQuery *InlineQuery `json:"inline_query,omitempty"`
}

type Message struct {
	MessageID int64  `json:"message_id"`
	Chat      Chat   `json:"chat"`
	Text      string `json:"text"`
	From      *User  `json:"from,omitempty"`
}

type Chat struct {
	ID   int64  `json:"id"`
	Type string `json:"type"`
}

type User struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	Username  string `json:"username,omitempty"`
}

type InlineQuery struct {
	ID    string `json:"id"`
	From  User   `json:"from"`
	Query string `json:"query"`
}

type Handler struct {
	BotToken   string
	WebAppURL  string // e.g. "https://t.me/botname/appname"
	WebhookURL string
}

func NewHandler(botToken, webAppURL, webhookURL string) *Handler {
	return &Handler{
		BotToken:   botToken,
		WebAppURL:  webAppURL,
		WebhookURL: webhookURL,
	}
}

// SetupWebhook registers the webhook URL with Telegram.
func (h *Handler) SetupWebhook() error {
	if h.BotToken == "" || h.WebhookURL == "" {
		return nil
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/setWebhook", h.BotToken)

	// Generate a secret token from the bot token hash for webhook verification
	secret := generateWebhookSecret(h.BotToken)

	body, _ := json.Marshal(map[string]interface{}{
		"url":          h.WebhookURL,
		"secret_token": secret,
	})

	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to set webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("webhook setup failed: %s", string(respBody))
	}

	log.Printf("[Bot] Webhook set to %s", h.WebhookURL)
	return nil
}

// HandleWebhook processes incoming Telegram updates.
func (h *Handler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Verify secret token
	secret := r.Header.Get("X-Telegram-Bot-Api-Secret-Token")
	if h.BotToken != "" && secret != generateWebhookSecret(h.BotToken) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	var update Update
	if err := json.Unmarshal(body, &update); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	h.processUpdate(&update)
	w.WriteHeader(http.StatusOK)
}

func (h *Handler) processUpdate(update *Update) {
	if update.Message != nil {
		h.handleMessage(update.Message)
	}
	if update.InlineQuery != nil {
		h.handleInlineQuery(update.InlineQuery)
	}
}

func (h *Handler) handleMessage(msg *Message) {
	text := strings.TrimSpace(msg.Text)

	switch {
	case text == "/start" || strings.HasPrefix(text, "/start "):
		h.handleStartCommand(msg)
	case text == "/help":
		h.sendMessage(msg.Chat.ID, "P2P Chess — play chess with friends!\n\nCommands:\n/start — Open the game\n/newgame — Create a new room\n/help — Show this message")
	case text == "/newgame":
		h.handleNewGame(msg)
	}
}

func (h *Handler) handleStartCommand(msg *Message) {
	parts := strings.SplitN(msg.Text, " ", 2)
	if len(parts) == 2 && parts[1] != "" {
		// Deep link: /start roomId — user was invited to a specific room
		roomID := parts[1]
		text := fmt.Sprintf("You've been invited to a chess game! 🎯\nTap the button below to join.")
		h.sendMessageWithWebApp(msg.Chat.ID, text, fmt.Sprintf("%s?startapp=%s", h.WebAppURL, roomID))
		return
	}

	h.sendMessageWithWebApp(msg.Chat.ID, "Welcome to P2P Chess! ♟\nTap the button below to start playing.", h.WebAppURL)
}

func (h *Handler) handleNewGame(msg *Message) {
	h.sendMessageWithWebApp(msg.Chat.ID, "Creating a new game! Tap below:", h.WebAppURL)
}

func (h *Handler) handleInlineQuery(query *InlineQuery) {
	if h.BotToken == "" {
		return
	}

	roomID := strings.TrimSpace(query.Query)
	if roomID == "" {
		roomID = "new"
	}

	results := []map[string]interface{}{
		{
			"type":  "article",
			"id":    fmt.Sprintf("chess_%s", roomID),
			"title": "Play Chess",
			"description": fmt.Sprintf("Invite to chess game (room: %s)", roomID),
			"input_message_content": map[string]interface{}{
				"message_text": fmt.Sprintf("♟ Let's play chess!\nJoin my game: %s?startapp=%s", h.WebAppURL, roomID),
			},
			"reply_markup": map[string]interface{}{
				"inline_keyboard": [][]map[string]interface{}{
					{
						{
							"text": "Play",
							"web_app": map[string]string{
								"url": fmt.Sprintf("%s?startapp=%s", h.WebAppURL, roomID),
							},
						},
					},
				},
			},
		},
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/answerInlineQuery", h.BotToken)
	body, _ := json.Marshal(map[string]interface{}{
		"inline_query_id": query.ID,
		"results":         results,
		"cache_time":      0,
	})

	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[Bot] Failed to answer inline query: %v", err)
		return
	}
	resp.Body.Close()
}

func (h *Handler) sendMessage(chatID int64, text string) {
	if h.BotToken == "" {
		return
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", h.BotToken)
	body, _ := json.Marshal(map[string]interface{}{
		"chat_id": chatID,
		"text":    text,
	})

	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[Bot] Failed to send message: %v", err)
		return
	}
	resp.Body.Close()
}

func (h *Handler) sendMessageWithWebApp(chatID int64, text, webAppURL string) {
	if h.BotToken == "" {
		return
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", h.BotToken)
	body, _ := json.Marshal(map[string]interface{}{
		"chat_id": chatID,
		"text":    text,
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]map[string]interface{}{
				{
					{
						"text": "Open Game",
						"web_app": map[string]string{
							"url": webAppURL,
						},
					},
				},
			},
		},
	})

	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[Bot] Failed to send message: %v", err)
		return
	}
	resp.Body.Close()
}

func generateWebhookSecret(token string) string {
	h := sha256.Sum256([]byte(token + ":webhook_secret"))
	return hex.EncodeToString(h[:16])
}
