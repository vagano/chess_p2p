# P2P Chess Prototype

Peer-to-peer chess web application with WebRTC primary channel, WebSocket fallback, CRDT state synchronization, and Stockfish analysis.

## Architecture

- **Frontend**: React + TypeScript + Vite + chess.js + react-chessboard + Yjs (CRDT)
- **Backend**: Go + skyterra/y-crdt + CorentinGS/chess + pion/webrtc + PostgreSQL
- **Sync**: Yjs CRDT with y-webrtc (P2P primary) and y-websocket (server fallback)
- **Analysis**: Stockfish via UCI protocol

## Prerequisites

- **Node.js** >= 18
- **Go** >= 1.23 (`brew install go`)
- **PostgreSQL** 16+ (via Docker or local)
- **Stockfish** (optional, for analysis: `brew install stockfish`)
- **Docker** + **Docker Compose** (for PostgreSQL)

## Quick Start

### Docker (full stack, one command)

```bash
docker compose up -d
# Open http://localhost:3000
```

By default runs in **hybrid** mode (P2P primary, WebSocket fallback).

Switch connection mode:

```bash
# WebSocket only
CONNECTION_MODE=websocket docker compose up -d

# P2P only
CONNECTION_MODE=p2p docker compose up -d
```

### Local Development

```bash
# Terminal 1: PostgreSQL
docker compose up -d postgres

# Terminal 2: Backend
cd backend && go mod tidy && go run cmd/server/main.go

# Terminal 3: Frontend (Vite dev server)
cd frontend && npm install && npm run dev
# Open http://localhost:5173
```

### Play

1. Open the app in your browser
2. Click **Create New Game**
3. Copy the link and open it in another browser tab/window
4. Play chess!

## How It Works

### Connection Flow

1. Both players connect to the same room via URL
2. **y-webrtc** attempts P2P connection (primary channel)
3. If P2P fails after 10s, **y-websocket** activates as fallback
4. When P2P is restored, WebSocket disconnects to save server resources

### Data Sync (Yjs CRDT)

- Game state (FEN, PGN, moves, players) stored in `Y.Map("game")`
- Updates propagate via active provider (WebRTC or WebSocket)
- CRDT ensures consistency even with out-of-order or duplicate updates
- Server validates moves and persists state to PostgreSQL

### Server Validation Pipeline

1. Receive Yjs update via WebSocket
2. Apply update to server-side Y.Doc (skyterra/y-crdt)
3. Extract game state from Y.Map
4. Validate moves using CorentinGS/chess
5. Save state to PostgreSQL
6. Trigger Stockfish analysis (async)

### Stockfish Analysis

- **During game**: quick analysis (depth 15) for eval bar
- **After game**: deep analysis (depth 20-25) with move classification
- Classifications: brilliant, great, best, good, inaccuracy, mistake, blunder
- Results available via `GET /api/game/{id}/analysis`

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/ws/{roomId}` | WS | y-websocket protocol (Yjs sync) |
| `/signaling` | WS | WebRTC signaling (y-webrtc) |
| `/api/room/{id}` | GET | Get room/game info |
| `/api/game/{id}/analysis` | GET | Get Stockfish analysis |
| `/health` | GET | Health check |

## Project Structure

```
p2p_poc/
  frontend/           # React + TypeScript + Vite
    src/
      components/     # UI components
      hooks/          # React hooks (chess game, Yjs sync)
      lib/            # Core logic (game state, connection manager)
  backend/            # Go
    cmd/server/       # Entry point
    internal/
      room/           # Room management
      ws/             # WebSocket + y-websocket protocol
      signaling/      # WebRTC signaling
      chess/          # Move validation
      analysis/       # Stockfish UCI client
      storage/        # PostgreSQL persistence
  docker-compose.yml  # PostgreSQL
```

## Future: Telegram Mini App

This app is designed to become a Telegram Mini App:
- Responsive mobile-first design
- No authentication required (will use Telegram user data)
- URL-based room sharing (compatible with Telegram deep links)
