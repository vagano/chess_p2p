package room

import (
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	ycrdt "github.com/skyterra/y-crdt"
)

// Room represents a game room with a Yjs document and connected clients.
type Room struct {
	ID      uuid.UUID
	Doc     *ycrdt.Doc
	clients map[*Client]struct{}
	mu      sync.RWMutex
}

// Client represents a WebSocket connection to a room.
type Client struct {
	Conn *websocket.Conn
	Room *Room
	mu   sync.Mutex
}

func NewRoom(id uuid.UUID) *Room {
	doc := ycrdt.NewDoc("", false, nil, nil, false)
	return &Room{
		ID:      id,
		Doc:     doc,
		clients: make(map[*Client]struct{}),
	}
}

func (r *Room) AddClient(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.clients[client] = struct{}{}
}

func (r *Room) RemoveClient(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.clients, client)
}

func (r *Room) ClientCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients)
}

// BroadcastUpdate sends a Yjs binary update to all clients except the sender.
func (r *Room) BroadcastUpdate(update []byte, sender *Client) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for client := range r.clients {
		if client == sender {
			continue
		}
		client.SendBinary(update)
	}
}

// SendBinary sends a binary message to the client.
func (c *Client) SendBinary(data []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.Conn.WriteMessage(websocket.BinaryMessage, data)
}

// SendJSON sends a JSON message to the client.
func (c *Client) SendJSON(data interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.Conn.WriteJSON(data)
}
