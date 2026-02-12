package signaling

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

// SignalingHandler implements a WebRTC signaling server.
// This is used by y-webrtc as a custom signaling server.
type SignalingHandler struct {
	upgrader websocket.Upgrader
	rooms    map[string]map[*sigClient]struct{}
	mu       sync.RWMutex
}

type sigClient struct {
	conn   *websocket.Conn
	roomID string
	mu     sync.Mutex
}

// SignalingMessage is the message format for signaling.
type SignalingMessage struct {
	Type   string          `json:"type"`
	Room   string          `json:"room,omitempty"`
	From   string          `json:"from,omitempty"`
	To     string          `json:"to,omitempty"`
	Data   json.RawMessage `json:"data,omitempty"`
	Topics []string        `json:"topics,omitempty"`
	Clients int            `json:"clients,omitempty"`
}

// NewSignalingHandler creates a new signaling handler.
func NewSignalingHandler() *SignalingHandler {
	return &SignalingHandler{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		rooms: make(map[string]map[*sigClient]struct{}),
	}
}

// HandleSignaling handles WebSocket connections for WebRTC signaling.
// This implements a protocol compatible with y-webrtc signaling.
func (h *SignalingHandler) HandleSignaling(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Signaling] Upgrade failed: %v", err)
		return
	}

	client := &sigClient{conn: conn}
	log.Printf("[Signaling] Client connected")

	defer func() {
		h.removeClient(client)
		conn.Close()
		log.Printf("[Signaling] Client disconnected")
	}()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("[Signaling] Read error: %v", err)
			}
			break
		}

		var msg SignalingMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("[Signaling] Invalid message: %v", err)
			continue
		}

		h.handleMessage(client, &msg, message)
	}
}

func (h *SignalingHandler) handleMessage(client *sigClient, msg *SignalingMessage, raw []byte) {
	switch msg.Type {
	case "subscribe":
		h.handleSubscribe(client, msg)
	case "unsubscribe":
		h.handleUnsubscribe(client, msg)
	case "publish":
		h.handlePublish(client, msg, raw)
	case "ping":
		h.handlePing(client)
	default:
		// y-webrtc may send signal messages directly
		if msg.Room != "" {
			h.broadcastToRoom(msg.Room, raw, client)
		}
	}
}

func (h *SignalingHandler) handleSubscribe(client *sigClient, msg *SignalingMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for _, topic := range msg.Topics {
		if _, ok := h.rooms[topic]; !ok {
			h.rooms[topic] = make(map[*sigClient]struct{})
		}
		h.rooms[topic][client] = struct{}{}
		client.roomID = topic

		// Notify the new client about the room size
		count := len(h.rooms[topic])
		response := SignalingMessage{
			Type:    "subscribe",
			Room:    topic,
			Clients: count,
		}
		data, _ := json.Marshal(response)
		client.mu.Lock()
		client.conn.WriteMessage(websocket.TextMessage, data)
		client.mu.Unlock()
	}

	log.Printf("[Signaling] Client subscribed to %v", msg.Topics)
}

func (h *SignalingHandler) handleUnsubscribe(client *sigClient, msg *SignalingMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for _, topic := range msg.Topics {
		if clients, ok := h.rooms[topic]; ok {
			delete(clients, client)
			if len(clients) == 0 {
				delete(h.rooms, topic)
			}
		}
	}
}

func (h *SignalingHandler) handlePublish(client *sigClient, msg *SignalingMessage, raw []byte) {
	for _, topic := range msg.Topics {
		h.broadcastToRoom(topic, raw, client)
	}
}

func (h *SignalingHandler) handlePing(client *sigClient) {
	response := SignalingMessage{Type: "pong"}
	data, _ := json.Marshal(response)
	client.mu.Lock()
	client.conn.WriteMessage(websocket.TextMessage, data)
	client.mu.Unlock()
}

func (h *SignalingHandler) broadcastToRoom(roomID string, message []byte, sender *sigClient) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	clients, ok := h.rooms[roomID]
	if !ok {
		return
	}

	for client := range clients {
		if client == sender {
			continue
		}
		client.mu.Lock()
		err := client.conn.WriteMessage(websocket.TextMessage, message)
		client.mu.Unlock()
		if err != nil {
			log.Printf("[Signaling] Broadcast error: %v", err)
		}
	}
}

func (h *SignalingHandler) removeClient(client *sigClient) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for roomID, clients := range h.rooms {
		if _, ok := clients[client]; ok {
			delete(clients, client)
			if len(clients) == 0 {
				delete(h.rooms, roomID)
			}
		}
	}
}
