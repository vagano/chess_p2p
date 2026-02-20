package room

import (
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type Room struct {
	ID      uuid.UUID
	clients map[*Client]struct{}
	mu      sync.RWMutex
}

type Client struct {
	Conn *websocket.Conn
	Room *Room
	mu   sync.Mutex
}

func NewRoom(id uuid.UUID) *Room {
	return &Room{
		ID:      id,
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

func (c *Client) SendBinary(data []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.Conn.WriteMessage(websocket.BinaryMessage, data)
}

func (c *Client) SendJSON(data interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.Conn.WriteJSON(data)
}
