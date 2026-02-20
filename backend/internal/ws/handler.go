package ws

import (
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"golang.org/x/time/rate"

	"github.com/ruchess/p2p_poc/backend/internal/room"
	"github.com/ruchess/p2p_poc/backend/internal/storage"
)

var upgrader = websocket.Upgrader{
	CheckOrigin:    func(r *http.Request) bool { return true },
	ReadBufferSize: 4096,
	WriteBufferSize: 4096,
}

type Handler struct {
	RoomManager      *room.Manager
	Store            *storage.PostgresStore
	OnUpdate         func(roomID uuid.UUID, rawMsg []byte)
	WSRateLimitMPS   float64
	WSRateLimitBurst int
	RateLimitEnabled bool
}

func (h *Handler) HandleYjsWS(w http.ResponseWriter, r *http.Request) {
	roomIDStr := r.URL.Query().Get("room")
	if roomIDStr == "" {
		path := r.URL.Path
		if len(path) > 4 {
			roomIDStr = path[4:]
		}
	}

	if roomIDStr == "" {
		http.Error(w, "room parameter required", http.StatusBadRequest)
		return
	}

	if len(roomIDStr) > 50 {
		http.Error(w, "room id too long", http.StatusBadRequest)
		return
	}

	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		roomID = uuid.NewSHA1(uuid.NameSpaceURL, []byte(roomIDStr))
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] Failed to upgrade: %v", err)
		return
	}

	gameRoom := h.RoomManager.GetOrCreateRoom(roomID)
	client := &room.Client{
		Conn: conn,
		Room: gameRoom,
	}
	gameRoom.AddClient(client)

	log.Printf("[WS] Client connected to room %s (total: %d)", roomIDStr, gameRoom.ClientCount())

	if h.Store != nil {
		_, _ = h.Store.CreateGame(r.Context(), roomID)
	}

	// Pure relay: no initial sync from server.
	// Existing clients will sync with the new one via relayed SyncStep1/SyncStep2.

	go h.readMessages(client, gameRoom, roomID)
}

func (h *Handler) readMessages(client *room.Client, gameRoom *room.Room, roomID uuid.UUID) {
	defer func() {
		gameRoom.RemoveClient(client)
		client.Conn.Close()
		log.Printf("[WS] Client disconnected from room %s (remaining: %d)", roomID, gameRoom.ClientCount())
		h.RoomManager.RemoveRoomIfEmpty(roomID)
	}()

	maxMsgSize := int64(getMaxMessageSize())
	client.Conn.SetReadLimit(maxMsgSize)

	var limiter *rate.Limiter
	if h.RateLimitEnabled && h.WSRateLimitMPS > 0 {
		limiter = rate.NewLimiter(rate.Limit(h.WSRateLimitMPS), h.WSRateLimitBurst)
	}

	for {
		messageType, data, err := client.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("[WS] Read error: %v", err)
			}
			break
		}

		if messageType != websocket.BinaryMessage {
			continue
		}

		if limiter != nil && !limiter.Allow() {
			log.Printf("[WS] Rate limit exceeded for client in room %s", roomID)
			continue
		}

		// Pure relay: forward all messages to other clients in the room.
		gameRoom.BroadcastUpdate(data, client)

		if h.OnUpdate != nil {
			h.OnUpdate(roomID, data)
		}
	}
}

func getMaxMessageSize() int {
	if v := os.Getenv("WS_MAX_MESSAGE_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 65536
}
