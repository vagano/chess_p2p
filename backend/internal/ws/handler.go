package ws

import (
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	ycrdt "github.com/skyterra/y-crdt"

	"github.com/ruchess/p2p_poc/backend/internal/room"
	"github.com/ruchess/p2p_poc/backend/internal/storage"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
}

// Handler holds dependencies for WebSocket endpoints.
type Handler struct {
	RoomManager *room.Manager
	Store       *storage.PostgresStore // may be nil in dev mode
	OnUpdate    func(roomID uuid.UUID, doc *ycrdt.Doc) // callback for validation/analysis
}

// HandleYjsWS handles the y-websocket protocol for a room.
func (h *Handler) HandleYjsWS(w http.ResponseWriter, r *http.Request) {
	roomIDStr := r.URL.Query().Get("room")
	if roomIDStr == "" {
		// Try path parameter: /ws/{roomId}
		// Simple extraction from path
		path := r.URL.Path
		if len(path) > 4 {
			roomIDStr = path[4:] // strip "/ws/"
		}
	}

	if roomIDStr == "" {
		http.Error(w, "room parameter required", http.StatusBadRequest)
		return
	}

	// Parse or generate room UUID
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		// Use a deterministic UUID from the room name
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

	// Create game in DB if store is available
	if h.Store != nil {
		_, _ = h.Store.CreateGame(r.Context(), roomID)
	}

	// Send initial sync (sync step 1 + step 2)
	h.sendInitialSync(client, gameRoom)

	// Handle messages
	go h.readMessages(client, gameRoom, roomID)
}

func (h *Handler) sendInitialSync(client *room.Client, gameRoom *room.Room) {
	doc := gameRoom.Doc

	// Send sync step 1: our state vector
	sv := ycrdt.EncodeStateVector(nil, nil, ycrdt.NewUpdateEncoderV1())
	if sv == nil {
		sv = []byte{}
	}

	// Encode full state as update for the client
	stateUpdate := ycrdt.EncodeStateAsUpdate(doc, nil)
	if stateUpdate != nil && len(stateUpdate) > 0 {
		msg := EncodeSyncStep2(stateUpdate)
		client.SendBinary(msg)
	}
}

func (h *Handler) readMessages(client *room.Client, gameRoom *room.Room, roomID uuid.UUID) {
	defer func() {
		gameRoom.RemoveClient(client)
		client.Conn.Close()
		log.Printf("[WS] Client disconnected from room %s (remaining: %d)", roomID, gameRoom.ClientCount())
		h.RoomManager.RemoveRoomIfEmpty(roomID)
	}()

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

		h.handleBinaryMessage(client, gameRoom, roomID, data)
	}
}

func (h *Handler) handleBinaryMessage(client *room.Client, gameRoom *room.Room, roomID uuid.UUID, data []byte) {
	msgType, subType, payload, err := ParseMessage(data)
	if err != nil {
		log.Printf("[WS] Failed to parse message: %v", err)
		return
	}

	switch msgType {
	case MsgSync:
		h.handleSyncMessage(client, gameRoom, roomID, subType, payload, data)
	case MsgAwareness:
		// Broadcast awareness to other clients
		gameRoom.BroadcastUpdate(data, client)
	case MsgQueryAwareness:
		// Respond with empty awareness for now
	}
}

func (h *Handler) handleSyncMessage(client *room.Client, gameRoom *room.Room, roomID uuid.UUID, subType byte, payload []byte, rawMsg []byte) {
	doc := gameRoom.Doc

	switch subType {
	case SyncStep1:
		// Client sends state vector, we respond with diff
		stateUpdate := ycrdt.EncodeStateAsUpdate(doc, payload)
		if stateUpdate != nil && len(stateUpdate) > 0 {
			msg := EncodeSyncStep2(stateUpdate)
			client.SendBinary(msg)
		}

		// Also send our state vector so client can send us what we're missing
		sv := ycrdt.EncodeStateVector(nil, nil, ycrdt.NewUpdateEncoderV1())
		if sv != nil {
			msg := EncodeSyncStep1(sv)
			client.SendBinary(msg)
		}

	case SyncStep2, SyncUpdate:
		// Apply the update to our doc
		if payload != nil && len(payload) > 0 {
			doc.Transact(func(trans *ycrdt.Transaction) {
				ycrdt.ApplyUpdate(doc, payload, nil)
			}, nil)

			// Broadcast to other clients
			gameRoom.BroadcastUpdate(rawMsg, client)

			// Trigger validation/persistence callback
			if h.OnUpdate != nil {
				h.OnUpdate(roomID, doc)
			}

			// Save snapshot to DB
			h.saveSnapshot(roomID, doc)
		}
	}
}

func (h *Handler) saveSnapshot(roomID uuid.UUID, doc *ycrdt.Doc) {
	if h.Store == nil {
		return
	}

	snapshot := ycrdt.EncodeStateAsUpdate(doc, nil)
	sv := ycrdt.EncodeStateVector(nil, nil, ycrdt.NewUpdateEncoderV1())

	if snapshot != nil {
		go func() {
			err := h.Store.SaveSnapshot(nil, roomID, snapshot, sv)
			if err != nil {
				log.Printf("[WS] Failed to save snapshot: %v", err)
			}
		}()
	}
}
