package room

import (
	"sync"

	"github.com/google/uuid"
)

// Manager handles game room lifecycle.
type Manager struct {
	rooms map[uuid.UUID]*Room
	mu    sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		rooms: make(map[uuid.UUID]*Room),
	}
}

// GetOrCreateRoom returns existing room or creates a new one.
func (m *Manager) GetOrCreateRoom(id uuid.UUID) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	if r, ok := m.rooms[id]; ok {
		return r
	}

	r := NewRoom(id)
	m.rooms[id] = r
	return r
}

// GetRoom returns a room by ID if it exists.
func (m *Manager) GetRoom(id uuid.UUID) (*Room, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	r, ok := m.rooms[id]
	return r, ok
}

// RemoveRoomIfEmpty removes a room if it has no clients.
func (m *Manager) RemoveRoomIfEmpty(id uuid.UUID) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if r, ok := m.rooms[id]; ok {
		if r.ClientCount() == 0 {
			delete(m.rooms, id)
		}
	}
}

// RoomCount returns the total number of active rooms.
func (m *Manager) RoomCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.rooms)
}
