# P2P Chess — Prototype

Peer-to-peer шахматное веб-приложение с WebRTC (P2P) как основным каналом, WebSocket fallback, синхронизацией состояния через Yjs CRDT, и анализом Stockfish.

Спроектировано как прототип для будущего Telegram Mini App.

## Архитектура

| Слой | Технологии |
|------|-----------|
| **Frontend** | React 19, TypeScript, Vite 7, chess.js, react-chessboard v5, Yjs |
| **CRDT-синхронизация** | Yjs, y-webrtc (P2P), y-websocket (WS fallback) |
| **Backend** | Go 1.24, gorilla/websocket, skyterra/y-crdt |
| **Шахматная логика** | chess.js (клиент), CorentinGS/chess/v2 (сервер) |
| **Анализ** | Stockfish через UCI-протокол |
| **Хранение** | PostgreSQL 16, jackc/pgx/v5 |
| **Инфра** | Docker, Docker Compose, Nginx |

```
Клиент A ◄──── WebRTC / WebSocket ────► Клиент B
                       │
                 Go Backend
            ┌──────────┼──────────┐
            │          │          │
      Валидация   PostgreSQL   Stockfish
```

> Подробная архитектура, диаграммы потоков, схема БД: [ARCHITECTURE.md](ARCHITECTURE.md)

## Требования

- **Node.js** >= 18
- **Go** >= 1.24
- **Docker** + **Docker Compose**
- **Stockfish** (опционально, для анализа: `brew install stockfish`)

## Быстрый старт

### Docker — полный стек одной командой

```bash
docker compose up -d
```

Откройте **http://localhost:3000**

По умолчанию — режим **hybrid** (P2P с WebSocket fallback).

### Выбор режима подключения

```bash
# Гибридный (P2P → WS fallback) — по умолчанию
docker compose up -d

# Только WebSocket (весь трафик через сервер)
CONNECTION_MODE=websocket docker compose up -d

# Только P2P (сервер только для signaling)
CONNECTION_MODE=p2p docker compose up -d
```

| Режим | Транспорт | Задержка | Сервер нужен | Надёжность |
|-------|-----------|----------|--------------|------------|
| `hybrid` | WebRTC + WS fallback | <50ms / ~150ms | Signaling + fallback | Максимальная |
| `p2p` | WebRTC only | <50ms | Только signaling | Зависит от сети |
| `websocket` | WebSocket only | ~100-200ms | Всегда | Максимальная |

### Локальная разработка (без Docker для frontend/backend)

```bash
# Терминал 1: PostgreSQL
docker compose up -d postgres

# Терминал 2: Go-бэкенд
cd backend
go mod tidy
go run cmd/server/main.go

# Терминал 3: Фронтенд (Vite dev server с proxy на :8080)
cd frontend
npm install
npm run dev
```

Откройте **http://localhost:5173**

Переключение режима в dev:
```bash
VITE_CONNECTION_MODE=websocket npm run dev
VITE_CONNECTION_MODE=p2p npm run dev
```

## Как играть

1. Откройте приложение в браузере
2. Нажмите **Create New Game**
3. Скопируйте ссылку и откройте во втором окне браузера (или отправьте другу)
4. Играйте!

Первый подключившийся — белые, второй — чёрные.

## API-эндпоинты

| Endpoint | Протокол | Описание |
|----------|----------|----------|
| `/ws/{roomId}` | WebSocket | y-websocket — двусторонняя Yjs-синхронизация |
| `/signaling` | WebSocket | WebRTC signaling — relay ICE/SDP для y-webrtc |
| `/api/room/{id}` | GET | Информация о комнате/игре |
| `/api/game/{id}/analysis` | GET | Результаты Stockfish-анализа партии |
| `/api/evaluate?fen=...&depth=12` | GET | Быстрая оценка позиции Stockfish (real-time) |
| `/health` | GET | Health check: rooms, DB, Stockfish |

## Структура проекта

```
p2p_poc/
├── ARCHITECTURE.md              # Подробная архитектура
├── README.md                    # ← этот файл
├── docker-compose.yml           # PostgreSQL + Backend + Frontend
│
├── frontend/                    # React + TypeScript + Vite
│   ├── Dockerfile               # Multi-stage: Node build → Nginx
│   ├── nginx.conf               # Proxy /ws, /signaling, /api → backend
│   ├── docker-entrypoint.sh     # ENV → /config.js (runtime injection)
│   ├── src/
│   │   ├── main.tsx             # React entry
│   │   ├── App.tsx              # Router: / → Home, /room/:id → GameRoom
│   │   │
│   │   ├── lib/
│   │   │   ├── gameState.ts     # Y.Doc ↔ GameState (CRDT helpers)
│   │   │   ├── connectionManager.ts  # State machine: P2P ⇄ WS
│   │   │   ├── config.ts        # Runtime config (Docker/Vite/auto-detect)
│   │   │   └── evaluation.ts    # Stockfish API + material fallback
│   │   │
│   │   ├── hooks/
│   │   │   ├── useYjsSync.ts    # Y.Doc + ConnectionManager init
│   │   │   └── useChessGame.ts  # chess.js ↔ Y.Doc sync, move replay
│   │   │
│   │   └── components/
│   │       ├── Home.tsx          # Лобби: создание/вход
│   │       ├── GameRoom.tsx      # Главный экран (оркестратор)
│   │       ├── ChessBoard.tsx    # Доска (react-chessboard v5)
│   │       ├── ConnectionStatus.tsx  # P2P/WS/Disconnected
│   │       ├── GameStatus.tsx    # Статус, список ходов
│   │       ├── EvalBar.tsx       # Полоска оценки позиции
│   │       └── GameAnalysis.tsx  # Анализ после окончания
│   │
│   └── package.json
│
└── backend/                     # Go 1.24
    ├── Dockerfile               # Multi-stage: Go build + Debian + Stockfish
    ├── go.mod
    ├── cmd/server/
    │   └── main.go              # HTTP-сервер, маршрутизация
    │
    └── internal/
        ├── room/
        │   ├── manager.go       # Lifecycle комнат
        │   └── room.go          # Room: Y.Doc + clients + broadcast
        ├── ws/
        │   ├── handler.go       # y-websocket handler
        │   └── yjs_sync.go      # Yjs binary protocol
        ├── signaling/
        │   └── handler.go       # WebRTC signaling relay
        ├── chess/
        │   └── validator.go     # Серверная валидация (UCI replay)
        ├── analysis/
        │   ├── stockfish.go     # UCI-клиент (quick + deep analysis)
        │   └── classifier.go    # Классификация: brilliant → blunder
        └── storage/
            ├── models.go        # Game, YjsSnapshot, MoveAnalysis
            ├── migrations.go    # DDL: CREATE TABLE
            └── postgres.go      # CRUD
```

## Переменные окружения

### Backend

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `PORT` | `8080` | Порт HTTP-сервера |
| `DATABASE_URL` | `postgres://...@localhost:5432/p2p_chess` | PostgreSQL URL |
| `STOCKFISH_PATH` | `stockfish` | Путь к Stockfish binary |
| `FRONTEND_URL` | `http://localhost:3000` | Origin для CORS |

### Frontend (Docker)

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `CONNECTION_MODE` | `hybrid` | `p2p` / `websocket` / `hybrid` |
| `WS_SERVER_URL` | auto-detect | WebSocket URL бэкенда |
| `SIGNALING_SERVERS` | auto-detect | JSON-массив signaling URL |
| `API_BASE_URL` | auto-detect | HTTP URL для REST API |

### Frontend (Vite dev)

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `VITE_CONNECTION_MODE` | `hybrid` | Режим подключения |
| `VITE_WS_SERVER_URL` | auto-detect | WebSocket URL |
| `VITE_SIGNALING_SERVERS` | auto-detect | Signaling URL |
| `VITE_API_BASE_URL` | auto-detect | API URL |

## Ключевые особенности

- **CRDT-синхронизация** — Yjs обеспечивает eventual consistency без центрального сервера
- **Бесконфликтная рассадка** — каждый клиент пишет в свой ключ Y.Map, цвет вычисляется детерминированно
- **Full move replay** — chess.js воспроизводит все ходы с начала, сохраняя полную PGN-историю
- **Evaluation bar** — real-time оценка через Stockfish API, fallback на подсчёт материала
- **Post-game analysis** — глубокий анализ (depth 20) с классификацией ходов (brilliant → blunder)
- **Серверная валидация** — Go-бэкенд проверяет легальность каждого хода через CorentinGS/chess
- **3 режима подключения** — P2P, WebSocket, Hybrid — один Docker-образ

## Будущее: Telegram Mini App

Приложение спроектировано для миграции в Telegram Mini App:

| Текущее | Telegram Mini App |
|---------|-------------------|
| `nanoid()` для playerId | `Telegram.WebApp.initDataUnsafe.user.id` |
| Ручной ввод имени | Telegram user name |
| URL-sharing | Telegram deep links / inline buttons |
| Нет авторизации | `initData` validation |
| Веб-браузер | Telegram WebView |

Архитектура не требует изменений — только клиентская адаптация.
