# P2P Chess — Telegram Mini App

Peer-to-peer шахматное приложение в Telegram Mini App с WebRTC (P2P) как основным каналом, WebSocket fallback, синхронизацией через Yjs CRDT, анализом Stockfish и серверной авторизацией через Telegram `initData`.

## Архитектура

| Слой | Технологии |
|------|-----------|
| **Frontend** | React 19, TypeScript, Vite 7, chess.js, react-chessboard v5, Yjs |
| **Telegram SDK** | telegram-web-app.js, MainButton, BackButton, HapticFeedback, deep links |
| **CRDT-синхронизация** | Yjs, y-webrtc (P2P), y-websocket (WS fallback) |
| **Backend** | Go 1.24, gorilla/websocket, skyterra/y-crdt |
| **Авторизация** | Telegram initData HMAC-SHA256, telegram-mini-apps/init-data-golang |
| **Шахматная логика** | chess.js (клиент), CorentinGS/chess/v2 (сервер) |
| **Анализ** | Stockfish через UCI-протокол |
| **Хранение** | PostgreSQL 16, jackc/pgx/v5 |
| **Безопасность** | Rate limiting (golang.org/x/time/rate), FEN-валидация, CRDT rollback |
| **Инфра** | Docker, Docker Compose, Nginx |

```
Telegram WebView
       │
Клиент A ◄──── WebRTC / WebSocket ────► Клиент B
                       │
                 Go Backend
            ┌──────────┼──────────┐
            │          │          │
      Валидация   PostgreSQL   Stockfish
      Auth/Rate                 Bot
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

1. Откройте приложение в Telegram или браузере
2. Нажмите **Create New Game** (или MainButton в Telegram)
3. Поделитесь ссылкой: в Telegram — кнопка **Invite**, в браузере — **Copy Link**
4. Играйте!

Первый подключившийся — белые, второй — чёрные.

### Telegram deep links

Для приглашения через Telegram используется формат:

```
https://t.me/BOT_USERNAME/APP_NAME?startapp=ROOM_ID
```

При открытии Mini App с `startapp` параметром — автоматический переход в комнату.

## Telegram Mini App

### Интеграция с Telegram SDK

- **telegram-web-app.js** подключен в `index.html`
- Обёртка `frontend/src/lib/telegram.ts` — типизированный доступ к SDK
- `ready()` и `expand()` вызываются при загрузке
- Graceful fallback для работы в обычном браузере (dev/testing)

### Identity

| Среда | Player ID | Player Name |
|-------|-----------|-------------|
| Telegram | `user.id.toString()` | `user.first_name` |
| Браузер | `nanoid(8)` | `Player_XXXX` |

Telegram user metadata (`telegramId`, `username`, `photoUrl`) сохраняется в CRDT `players` map.

### UI адаптация

- **Тема** — CSS-переменные Telegram (`--tg-theme-bg-color`, `--tg-theme-text-color`, и т.д.) с fallback
- **Мобильный layout** — на экранах < 600px sidebar перемещается под доску
- **Safe area** — `env(safe-area-inset-top/bottom)` для устройств с вырезами
- **Haptic feedback:**
  - `impactOccurred('light')` — при каждом ходе
  - `notificationOccurred('error')` — при невалидном ходе
  - `notificationOccurred('success')` — при мате / окончании игры
- **MainButton:**
  - Home: "Create New Game"
  - Ожидание оппонента: "Invite Friend"
  - В игре: скрыта
- **BackButton:** в GameRoom — возврат на Home

### Серверная авторизация

- `initData` передаётся в `Authorization: tma <initData>` header (HTTP) и query-параметром (WebSocket)
- Бэкенд валидирует через HMAC-SHA256 с `TELEGRAM_BOT_TOKEN`
- Bypass для dev: `SKIP_TG_AUTH=true`
- CORS: конкретные origins вместо `*`

### Telegram Bot

Встроен в Go-бэкенд (`/bot/webhook`):

| Команда | Действие |
|---------|----------|
| `/start` | Приветствие + кнопка Open Game |
| `/start roomId` | Приглашение в конкретную комнату |
| `/newgame` | Создание новой игры |
| `/help` | Справка |
| Inline query | Поиск/создание комнаты, генерация invite-кнопки |

Webhook регистрируется автоматически при старте сервера.

## API-эндпоинты

| Endpoint | Протокол | Auth | Rate Limit | Описание |
|----------|----------|------|------------|----------|
| `/ws/{roomId}` | WebSocket | initData (query) | WS msg/s | y-websocket Yjs-синхронизация |
| `/signaling` | WebSocket | initData (query) | — | WebRTC signaling relay |
| `/api/room/{id}` | GET | initData | API RPM | Информация о комнате/игре |
| `/api/game/{id}/analysis` | GET | initData | API RPM | Результаты Stockfish-анализа |
| `/api/evaluate?fen=...&depth=12` | GET | initData | Evaluate RPS | Быстрая оценка позиции |
| `/bot/webhook` | POST | Telegram secret | — | Telegram Bot webhook |
| `/health` | GET | — | — | Health check |

## Безопасность

### Rate Limiting

Конфигурируемый через env token bucket rate limiter (`golang.org/x/time/rate`):

| Env-переменная | По умолчанию | Описание |
|----------------|-------------|----------|
| `RATE_LIMIT_ENABLED` | `true` | Глобальный вкл/выкл |
| `RATE_LIMIT_EVALUATE_RPS` | `2` | Запросов/сек на `/api/evaluate` per IP |
| `RATE_LIMIT_EVALUATE_BURST` | `5` | Burst для evaluate |
| `RATE_LIMIT_API_RPM` | `60` | Запросов/мин на REST API per IP |
| `RATE_LIMIT_API_BURST` | `10` | Burst для API |
| `RATE_LIMIT_WS_MPS` | `10` | Сообщений/сек per WebSocket connection |
| `RATE_LIMIT_WS_BURST` | `20` | Burst для WebSocket |

Per-IP limiter с TTL-очисткой (GC каждые 5 мин). При превышении — HTTP 429 с `Retry-After`.

### Input Validation

- **FEN** — regex-проверка формата перед передачей Stockfish
- **WebSocket** — ограничение размера сообщений (`WS_MAX_MESSAGE_SIZE`, default 65536)
- **Room ID** — max 50 символов

### CRDT Rollback

Невалидные ходы откатываются сервером через CRDT-транзакцию: последний ход удаляется из `moves[]`, FEN восстанавливается.

### Proxy Headers

При `TRUST_PROXY=true` — `X-Forwarded-For` и `X-Real-IP` используются для корректного rate limiting за reverse proxy. TLS termination — на уровне деплоя.

## Структура проекта

```
p2p_poc/
├── ARCHITECTURE.md              # Подробная архитектура
├── README.md                    # ← этот файл
├── docker-compose.yml           # PostgreSQL + Backend + Frontend
│
├── frontend/                    # React + TypeScript + Vite
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── docker-entrypoint.sh
│   ├── src/
│   │   ├── main.tsx             # Entry: Telegram ready() + React
│   │   ├── App.tsx              # Router: / → Home, /room/:id → GameRoom
│   │   │
│   │   ├── lib/
│   │   │   ├── telegram.ts      # Telegram WebApp SDK обёртка
│   │   │   ├── gameState.ts     # Y.Doc ↔ GameState (CRDT helpers)
│   │   │   ├── connectionManager.ts  # State machine: P2P ⇄ WS + auth
│   │   │   ├── config.ts        # Runtime config (Docker/Vite/auto-detect)
│   │   │   └── evaluation.ts    # Stockfish API + material fallback
│   │   │
│   │   ├── hooks/
│   │   │   ├── useYjsSync.ts    # Y.Doc + ConnectionManager init
│   │   │   └── useChessGame.ts  # chess.js ↔ Y.Doc sync, move replay
│   │   │
│   │   └── components/
│   │       ├── Home.tsx          # Лобби: создание/вход, startapp redirect
│   │       ├── GameRoom.tsx      # Главный экран + Telegram UI
│   │       ├── ChessBoard.tsx    # Доска (react-chessboard v5)
│   │       ├── ConnectionStatus.tsx
│   │       ├── GameStatus.tsx
│   │       ├── EvalBar.tsx
│   │       └── GameAnalysis.tsx
│   │
│   └── package.json
│
└── backend/                     # Go 1.24
    ├── Dockerfile
    ├── go.mod
    ├── cmd/server/
    │   └── main.go              # HTTP-сервер, маршрутизация, auth, rate limiting
    │
    └── internal/
        ├── auth/
        │   └── telegram.go      # initData HMAC-SHA256 валидация
        ├── bot/
        │   └── handler.go       # Telegram Bot: команды, inline, webhook
        ├── middleware/
        │   ├── ratelimit.go     # Token bucket per-IP/per-connection
        │   └── validation.go    # FEN regex, Room ID validation
        ├── room/
        │   ├── manager.go       # Lifecycle комнат
        │   └── room.go          # Room: Y.Doc + clients + broadcast
        ├── ws/
        │   ├── handler.go       # y-websocket + WS rate limiting
        │   └── yjs_sync.go      # Yjs binary protocol
        ├── signaling/
        │   └── handler.go       # WebRTC signaling relay
        ├── chess/
        │   └── validator.go     # Серверная валидация (UCI replay)
        ├── analysis/
        │   ├── stockfish.go     # UCI-клиент (quick + deep)
        │   └── classifier.go    # Классификация: brilliant → blunder
        └── storage/
            ├── models.go
            ├── migrations.go
            └── postgres.go
```

## Переменные окружения

### Backend

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `PORT` | `8080` | Порт HTTP-сервера |
| `DATABASE_URL` | `postgres://...@localhost:5432/p2p_chess` | PostgreSQL URL |
| `STOCKFISH_PATH` | `stockfish` | Путь к Stockfish binary |
| `FRONTEND_URL` | `http://localhost:5173` | Origin для CORS |
| `CORS_ORIGINS` | `` | Дополнительные CORS origins (через запятую) |
| `TELEGRAM_BOT_TOKEN` | `` | Токен бота для initData валидации и Bot API |
| `TELEGRAM_WEBAPP_URL` | `` | URL Mini App (e.g. `https://t.me/bot/app`) |
| `TELEGRAM_WEBHOOK_URL` | `` | URL для Telegram Bot webhook |
| `SKIP_TG_AUTH` | `true` | `true` — отключить auth (dev mode) |
| `TRUST_PROXY` | `false` | Доверять `X-Forwarded-For` / `X-Real-IP` |
| `WS_MAX_MESSAGE_SIZE` | `65536` | Макс. размер WS-сообщения (bytes) |
| `RATE_LIMIT_ENABLED` | `true` | Включить rate limiting |
| `RATE_LIMIT_EVALUATE_RPS` | `2` | `/api/evaluate` — запросов/сек per IP |
| `RATE_LIMIT_EVALUATE_BURST` | `5` | Burst для evaluate |
| `RATE_LIMIT_API_RPM` | `60` | REST API — запросов/мин per IP |
| `RATE_LIMIT_API_BURST` | `10` | Burst для API |
| `RATE_LIMIT_WS_MPS` | `10` | WS — сообщений/сек per connection |
| `RATE_LIMIT_WS_BURST` | `20` | Burst для WS |

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
| `VITE_TG_BOT_USERNAME` | `` | Username бота (для deep links) |
| `VITE_TG_APP_NAME` | `` | Имя Mini App (для deep links) |

## Ключевые особенности

- **Telegram Mini App** — полная интеграция: авторизация, deep links, haptics, адаптивный UI
- **CRDT-синхронизация** — Yjs обеспечивает eventual consistency без центрального сервера
- **Бесконфликтная рассадка** — каждый клиент пишет в свой ключ Y.Map, цвет вычисляется детерминированно
- **Full move replay** — chess.js воспроизводит все ходы с начала, сохраняя полную PGN-историю
- **Evaluation bar** — real-time оценка через Stockfish API, fallback на подсчёт материала
- **Post-game analysis** — глубокий анализ (depth 20) с классификацией ходов (brilliant → blunder)
- **Серверная валидация** — Go-бэкенд проверяет легальность каждого хода, невалидные — откатываются через CRDT
- **Telegram Bot** — `/start`, inline query, приглашения, автоматический webhook
- **Rate limiting** — конфигурируемый через env, per-IP для HTTP, per-connection для WS
- **3 режима подключения** — P2P, WebSocket, Hybrid — один Docker-образ
