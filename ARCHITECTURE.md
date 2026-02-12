# Architecture: P2P Chess (Telegram Mini App Prototype)

## Обзор

P2P-шахматное приложение с гибридной архитектурой синхронизации: WebRTC как основной канал (peer-to-peer), WebSocket как fallback (через сервер). Состояние игры управляется через **Yjs CRDT**, что обеспечивает eventual consistency без центрального источника истины.

Приложение спроектировано как прототип для будущего Telegram Mini App.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Клиент A (React)                         │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ chess.js  │  │   Y.Doc      │  │   ConnectionManager      │  │
│  │ (логика)  │←→│  (CRDT state)│←→│  WebRTC ⇄ WS fallback   │  │
│  └──────────┘  └──────┬───────┘  └──────────┬───────────────┘  │
│                       │                      │                   │
└───────────────────────┼──────────────────────┼───────────────────┘
                        │                      │
              ┌─────────┼──────────────────────┼──────────┐
              │  P2P    │  BroadcastChannel /   │  WS      │
              │  (same  │  WebRTC DataChannel   │  fallback│
              │  browser│                       │          │
              │  tabs)  │                       │          │
              └─────────┼───────────────────────┼──────────┘
                        │                      │
┌───────────────────────┼──────────────────────┼───────────────────┐
│                       │     Go Backend       │                   │
│                       │                      │                   │
│  ┌────────────────────▼──┐  ┌────────────────▼───────────────┐  │
│  │  Signaling Server     │  │  y-websocket Handler           │  │
│  │  /signaling           │  │  /ws/{roomId}                  │  │
│  │  (relay ICE/SDP)      │  │  (Yjs sync + validation)      │  │
│  └───────────────────────┘  └─────────────┬──────────────────┘  │
│                                           │                      │
│                              ┌────────────▼────────────┐        │
│                              │  Room Manager           │        │
│                              │  Y.Doc (server copy)    │        │
│                              └────────────┬────────────┘        │
│                                           │                      │
│            ┌──────────────────────────────┼───────────────┐      │
│            │                              │               │      │
│  ┌─────────▼──────┐  ┌───────────────────▼─┐  ┌─────────▼───┐  │
│  │ Chess Validator │  │  PostgreSQL Store   │  │  Stockfish  │  │
│  │ (CorentinGS)   │  │  (games, snapshots, │  │  (UCI)      │  │
│  │                 │  │   analysis)         │  │             │  │
│  └─────────────────┘  └────────────────────┘  └─────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Стек технологий

| Слой | Технологии |
|------|-----------|
| **Frontend** | React 19, TypeScript, Vite 7, chess.js, react-chessboard v5 |
| **CRDT** | Yjs, y-webrtc (P2P), y-websocket (fallback) |
| **Backend** | Go 1.24, gorilla/websocket, skyterra/y-crdt |
| **Шахматы (сервер)** | CorentinGS/chess/v2 (валидация), Stockfish (анализ, UCI) |
| **Хранение** | PostgreSQL 16 (jackc/pgx/v5) |
| **Инфраструктура** | Docker, Docker Compose |

---

## Структура проекта

```
p2p_poc/
│
├── ARCHITECTURE.md          # ← этот файл
├── README.md                # Quick start, описание API
├── docker-compose.yml       # PostgreSQL + Backend
│
├── frontend/                # React + TypeScript + Vite
│   ├── vite.config.ts       # Proxy: /ws, /signaling, /api → :8080
│   ├── src/
│   │   ├── main.tsx         # React entry point
│   │   ├── App.tsx          # Router: / → Home, /room/:id → GameRoom
│   │   ├── index.css        # Глобальные стили
│   │   │
│   │   ├── lib/                        # Ядро
│   │   │   ├── gameState.ts            # Y.Doc ↔ GameState (CRDT helpers)
│   │   │   └── connectionManager.ts    # State machine: P2P ⇄ WS
│   │   │
│   │   ├── hooks/                      # React hooks
│   │   │   ├── useYjsSync.ts           # Инициализация Y.Doc + ConnectionManager
│   │   │   └── useChessGame.ts         # chess.js ↔ Y.Doc синхронизация
│   │   │
│   │   └── components/                 # UI
│   │       ├── Home.tsx                # Лобби: создание/вход в комнату
│   │       ├── GameRoom.tsx            # Главный экран игры (оркестратор)
│   │       ├── ChessBoard.tsx          # Шахматная доска (react-chessboard v5)
│   │       ├── ConnectionStatus.tsx    # Индикатор P2P/WS/Disconnected
│   │       ├── GameStatus.tsx          # Статус игры, список ходов
│   │       ├── EvalBar.tsx             # Оценка позиции (Stockfish)
│   │       └── GameAnalysis.tsx        # Анализ партии после окончания
│   │
│   └── package.json
│
└── backend/                 # Go
    ├── Dockerfile           # Multi-stage: Go build + Debian + Stockfish
    ├── go.mod
    ├── cmd/server/
    │   └── main.go          # HTTP-сервер, маршрутизация, graceful shutdown
    │
    └── internal/
        ├── room/
        │   ├── manager.go   # Lifecycle комнат (create/get/remove)
        │   └── room.go      # Room: Y.Doc + WebSocket clients + broadcast
        │
        ├── ws/
        │   ├── handler.go   # y-websocket обработчик (sync + callbacks)
        │   └── yjs_sync.go  # Кодирование/декодирование Yjs-протокола
        │
        ├── signaling/
        │   └── handler.go   # WebRTC signaling relay (ICE/SDP)
        │
        ├── chess/
        │   └── validator.go # Серверная валидация ходов (UCI)
        │
        ├── analysis/
        │   ├── stockfish.go # UCI-клиент Stockfish (quick + deep analysis)
        │   └── classifier.go# Классификация ходов (brilliant → blunder)
        │
        └── storage/
            ├── models.go    # Game, YjsSnapshot, MoveAnalysis
            ├── migrations.go# DDL: CREATE TABLE
            └── postgres.go  # CRUD операции
```

---

## Ключевые концепции

### 1. Yjs CRDT — единый источник состояния

Вся игровая информация хранится в **Yjs-документе** (`Y.Doc`), а не в React-стейте или на сервере. Компоненты **подписываются** на изменения документа и реактивно обновляют UI.

**Структура Y.Doc:**

```
Y.Doc
├── Y.Map("game")              # Состояние партии
│   ├── fen: string            # Текущая позиция (FEN)
│   ├── pgn: string            # Запись партии (PGN)
│   ├── moves: string[]        # Массив ходов (UCI: "e2e4", "e7e5", ...)
│   ├── status: GameStatus     # "waiting" | "playing" | "finished"
│   ├── result: GameResult     # "1-0" | "0-1" | "1/2-1/2" | "*"
│   ├── white: PlayerInfo      # { id, name }
│   ├── black: PlayerInfo      # { id, name }
│   └── lastMoveAt: number     # Timestamp последнего хода
│
└── Y.Map("players")           # Бесконфликтная рассадка
    ├── [playerId_A]: SeatEntry  # { id, name, joinedAt }
    └── [playerId_B]: SeatEntry  # { id, name, joinedAt }
```

**Почему два Map'а?** `players` использует уникальные ключи для каждого клиента — это исключает write-конфликты при одновременном подключении. Цвет **вычисляется** из порядка `joinedAt` (первый = белые), а не назначается. Затем результат записывается в `game.white` / `game.black` для обратной совместимости с бэкендом.

### 2. Гибридная P2P ↔ WebSocket связь

```
                  ┌────────────────────┐
                  │   ConnectionManager │
                  │   (state machine)   │
                  └─────────┬──────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                   │
         ▼                  ▼                   ▼
   P2P_CONNECTING    P2P_CONNECTED         WS_FALLBACK
   (y-webrtc init)   (основной режим)      (через сервер)
         │                  │                   │
         │    timeout 10s   │   P2P failure     │
         └──────────────────┼───────────────────┘
                            │
                      DISCONNECTED
                      (нет связи)
```

**Состояния:**

| Состояние | Описание |
|-----------|----------|
| `P2P_CONNECTING` | y-webrtc инициализирует WebRTC DataChannel |
| `P2P_CONNECTED` | Прямой P2P канал между браузерами |
| `WS_FALLBACK` | P2P не удался, данные идут через WebSocket-сервер |
| `RECONNECTING` | Попытка восстановить P2P из WS_FALLBACK |
| `DISCONNECTED` | Нет активного соединения |

**Механизм fallback:**
1. При загрузке создаётся `WebrtcProvider` (P2P)
2. Если через 10 секунд P2P не установлен → активируется `WebsocketProvider`
3. Периодически (каждые 30с) пытается восстановить P2P
4. При восстановлении P2P → WebSocket отключается

**Важно:** Yjs автоматически мёржит обновления от обоих провайдеров. Переключение P2P ↔ WS прозрачно для игровой логики.

### 3. Разделение ответственности клиент/сервер

```
┌─────────────────── Клиент ───────────────────┐
│                                               │
│  chess.js          Yjs CRDT        React UI   │
│  ┌───────────┐    ┌──────────┐   ┌─────────┐ │
│  │ Валидация │    │ Источник │   │ Рендер  │ │
│  │ хода      │───→│ истины   │──→│ по      │ │
│  │ (локальная)│    │ (Y.Doc)  │   │ подписке│ │
│  └───────────┘    └────┬─────┘   └─────────┘ │
│                        │                       │
└────────────────────────┼───────────────────────┘
                         │ Yjs sync (P2P или WS)
┌────────────────────────┼───────────────────────┐
│                        │      Сервер           │
│                   ┌────▼─────┐                 │
│                   │  Y.Doc   │                 │
│                   │ (копия)  │                 │
│                   └────┬─────┘                 │
│                        │                       │
│          ┌─────────────┼──────────────┐        │
│          │             │              │        │
│    ┌─────▼────┐  ┌─────▼────┐  ┌─────▼─────┐  │
│    │ Валидация│  │ Persist  │  │ Stockfish │  │
│    │ (полная) │  │ (PG)     │  │ (анализ)  │  │
│    └──────────┘  └──────────┘  └───────────┘  │
│                                                │
└────────────────────────────────────────────────┘
```

- **Клиент**: быстрая локальная валидация через chess.js, мгновенный UI-отклик
- **Сервер**: авторитетная валидация, персистентность, анализ
- **Один и тот же pipeline** для P2P-режима (периодическая синхронизация) и WS-fallback (каждое обновление)

---

## Потоки данных

### Поток 1: Подключение к комнате

```
1. Пользователь открывает /room/{roomId}
2. GameRoom создаёт Y.Doc + ConnectionManager
3. registerPlayer(doc, playerId, playerName)
   → пишет в Y.Map("players")[playerId] = { id, name, joinedAt }
4. ConnectionManager:
   a. Создаёт WebrtcProvider (сигналинг через /signaling)
   b. Создаёт WebsocketProvider (если P2P timeout)
5. Yjs sync: документы мёржатся между пирами
6. derivePlayerColor():
   - Сортирует entries по joinedAt
   - Первый → white, второй → black
7. syncSeatingToGameMap():
   - Записывает white/black в Y.Map("game")
   - Если оба сели → status = "playing"
```

### Поток 2: Ход

```
1. Игрок кликает/перетаскивает фигуру
2. ChessBoard → onPieceDrop({ sourceSquare, targetSquare })
3. useChessGame.makeMove():
   a. chess.js валидирует ход локально
   b. Если валиден:
      - updateGameMove(doc, fen, pgn, uci)
      - Записывает в Y.Map("game"): fen, pgn, moves[], lastMoveAt
4. Yjs распространяет update:
   a. P2P → напрямую оппоненту
   b. WS → через сервер
5. Оппонент получает update:
   a. observeDeep на Y.Map("game") срабатывает
   b. chess.js загружает новый FEN
   c. React обновляет доску
```

### Поток 3: Серверная валидация и персистентность

```
1. WS Handler получает Yjs update
2. Применяет к серверному Y.Doc (skyterra/y-crdt)
3. Читает game state из Y.Map
4. chess.Validator:
   a. Парсит FEN
   b. Проигрывает все UCI-ходы с нуля
   c. Проверяет легальность каждого хода
5. storage.PostgresStore:
   a. Upsert game record
   b. Save Yjs snapshot (binary)
6. Если status == "finished":
   a. analysis.Stockfish.AnalyzeGameAsync()
   b. Для каждого хода: depth 20-25 анализ
   c. classifier.ClassifyMove() → brilliant/blunder/etc.
   d. Результаты → move_analysis таблица
```

### Поток 4: Анализ партии (после окончания)

```
1. GameRoom обнаруживает isGameOver
2. syncWithServer() — финальная синхронизация
3. Бэкенд запускает async Stockfish analysis
4. GameAnalysis компонент:
   a. Polling GET /api/game/{id}/analysis
   b. Отображает: eval chart, classifications, PV
```

---

## Схема базы данных

```sql
┌──────────────────────────┐
│         games            │
├──────────────────────────┤
│ id          VARCHAR(50)  │ PK
│ status      VARCHAR(20)  │ waiting/playing/finished
│ result      VARCHAR(10)  │ 1-0, 0-1, 1/2-1/2, *
│ fen         TEXT         │ текущий FEN
│ pgn         TEXT         │ полная запись
│ white_id    VARCHAR(50)  │
│ black_id    VARCHAR(50)  │
│ created_at  TIMESTAMPTZ  │
│ updated_at  TIMESTAMPTZ  │
└──────────┬───────────────┘
           │ 1:N
┌──────────▼───────────────┐
│     yjs_snapshots        │
├──────────────────────────┤
│ id          SERIAL       │ PK
│ game_id     VARCHAR(50)  │ FK → games
│ snapshot    BYTEA        │ бинарный Yjs snapshot
│ created_at  TIMESTAMPTZ  │
└──────────────────────────┘

           │ 1:N
┌──────────▼───────────────┐
│     move_analysis        │
├──────────────────────────┤
│ id              SERIAL   │ PK
│ game_id         VARCHAR  │ FK → games
│ move_number     INT      │
│ fen             TEXT     │ позиция до хода
│ best_move       VARCHAR  │ лучший ход по Stockfish
│ score_cp        INT      │ оценка в сантипешках
│ is_mate         BOOLEAN  │
│ mate_in         INT      │ nullable
│ depth           INT      │ глубина анализа
│ pv              TEXT     │ principal variation
│ classification  VARCHAR  │ brilliant/great/.../blunder
│ win_pct         REAL     │
│ draw_pct        REAL     │
│ loss_pct        REAL     │
│ created_at      TIMESTAMPTZ │
└──────────────────────────┘
```

---

## API

| Endpoint | Метод | Протокол | Описание |
|----------|-------|----------|----------|
| `/ws/{roomId}` | — | WebSocket | y-websocket: двусторонняя Yjs-синхронизация |
| `/signaling` | — | WebSocket | y-webrtc signaling: relay ICE candidates и SDP |
| `/api/room/{id}` | GET | HTTP | Информация о комнате/игре |
| `/api/game/{id}/analysis` | GET | HTTP | Результаты Stockfish-анализа |
| `/health` | GET | HTTP | Статус: rooms, DB, Stockfish |

### y-websocket протокол (бинарный)

```
Message Type 0: SyncStep1  — клиент отправляет state vector
Message Type 1: SyncStep2  — сервер отвечает diff
Message Type 2: Update     — инкрементальное обновление
Message Type 3: Awareness  — presence данные (курсор, статус)
```

### WebRTC Signaling протокол

```json
{ "type": "subscribe", "topics": ["room-xyz"] }
{ "type": "publish",   "topic": "room-xyz", "data": "<base64 ICE/SDP>" }
{ "type": "ping" }
{ "type": "pong" }
```

---

## Ключевые решения

### Почему Yjs CRDT, а не обычный WebSocket?

| Аспект | WebSocket | Yjs CRDT |
|--------|-----------|----------|
| Offline-режим | Невозможен | Локальные изменения мёржатся при reconnect |
| Конфликты | Потеря данных (last-write-wins) | Автоматическое разрешение |
| P2P | Невозможен | Встроенная поддержка |
| Серверная нагрузка | Каждый ход проходит через сервер | Основной трафик P2P |
| Сложность | Проще для простых случаев | Сложнее начальная настройка |

### Почему бесконфликтная рассадка (Y.Map "players")?

Первоначальный подход — оба клиента пишут в один ключ `white` — приводил к CRDT-конфликтам при одновременном подключении. Решение:

1. Каждый клиент пишет в **свой уникальный ключ** → конфликтов нет
2. Цвет **вычисляется** (sort by joinedAt) → детерминированный результат
3. Результат записывается в `game.white`/`game.black` → обратная совместимость

### Почему react-chessboard v5 через `options`?

В v5 API полностью изменилось: все пропы (включая `boardOrientation`, `onPieceDrop`, `onSquareClick`) передаются через единый объект `options`, а callback-и получают объект вместо позиционных аргументов:

```typescript
// v4 (СТАРОЕ):
<Chessboard boardOrientation="black" onPieceDrop={(src, tgt) => ...} />

// v5 (НОВОЕ):
<Chessboard options={{
  boardOrientation: 'black',
  onPieceDrop: ({ sourceSquare, targetSquare }) => ...,
}} />
```

---

## Режимы подключения (CONNECTION_MODE)

Режим задаётся переменной окружения `CONNECTION_MODE` при запуске Docker-контейнера фронтенда. Один и тот же Docker-образ работает во всех трёх режимах.

### Сравнение режимов

```
┌──────────────────┬──────────────────┬───────────────────┬───────────────────────┐
│                  │     p2p          │    websocket      │    hybrid (default)   │
├──────────────────┼──────────────────┼───────────────────┼───────────────────────┤
│ Транспорт        │ WebRTC only      │ WebSocket only    │ WebRTC + WS fallback  │
│ Задержка         │ <50ms            │ ~100-200ms        │ <50ms (P2P) / ~150ms  │
│ Сервер нужен     │ Только signaling │ Всегда            │ Signaling + fallback  │
│ Offline          │ Да (между пирами)│ Нет               │ Да (в P2P-фазе)      │
│ Валидация        │ Периодическая    │ Каждый ход        │ Зависит от фазы       │
│ Персистентность  │ По расписанию    │ Реальное время    │ По расписанию / RT    │
│ NAT Traversal    │ Нужен TURN       │ Не нужен          │ Нужен TURN для P2P    │
│ Масштабируемость │ Отличная         │ Ограничена        │ Отличная              │
│ Надёжность       │ Зависит от сети  │ Максимальная      │ Максимальная          │
└──────────────────┴──────────────────┴───────────────────┴───────────────────────┘
```

### Режим `p2p`

```
Клиент A ◄──── WebRTC DataChannel ────► Клиент B
                     │
              BroadcastChannel
              (same-browser tabs)

Сервер: только /signaling (relay ICE/SDP)
```

- Весь трафик идёт **напрямую** между браузерами
- Сервер нужен только для начального signaling (обмен ICE/SDP)
- Серверная валидация/персистентность — только при явном `syncWithServer()` (каждые 5 ходов, при окончании)
- **Лучший выбор**: когда оба клиента в одной сети или имеют хорошее P2P-соединение

### Режим `websocket`

```
Клиент A ◄──── WebSocket ────► Сервер ◄──── WebSocket ────► Клиент B
                                  │
                          ┌───────┴────────┐
                          │ Validation     │
                          │ Persistence    │
                          │ Stockfish      │
                          └────────────────┘
```

- Весь трафик идёт **через сервер**
- Каждое обновление Yjs-документа проходит серверную валидацию
- Максимальная надёжность — не зависит от NAT/firewall
- **Лучший выбор**: корпоративные сети, строгие firewall, нужна полная серверная валидация

### Режим `hybrid` (по умолчанию)

```
                    ┌──────── фаза 1: P2P ────────┐
Клиент A ◄──────── WebRTC DataChannel ──────────► Клиент B
                                                        
                    ┌──── фаза 2: WS Fallback ────┐   (если P2P не удался за 10с)
Клиент A ◄── WS ──► Сервер ◄── WS ──► Клиент B   
                                                        
                    ┌──── фаза 3: P2P Restored ───┐   (периодические попытки)
Клиент A ◄──────── WebRTC DataChannel ──────────► Клиент B
```

- Пытается установить **P2P** в первую очередь
- Если через 10 секунд P2P не удался → автоматический **fallback на WebSocket**
- Каждые 30 секунд пытается **восстановить P2P**
- При восстановлении P2P — WebSocket отключается
- **Лучший выбор**: универсальный режим для любых условий

### Конфигурация (runtime)

Конфигурация инжектится при старте Docker-контейнера через `/config.js`:

```
┌──────────────────────┐     docker-entrypoint.sh     ┌──────────────────┐
│  ENV vars:           │  ─────────────────────────►  │  /config.js      │
│  CONNECTION_MODE     │     генерирует при старте     │  window.__CONFIG__│
│  WS_SERVER_URL       │                               └────────┬─────────┘
│  SIGNALING_SERVERS   │                                        │
│  API_BASE_URL        │                                        ▼
└──────────────────────┘                               ┌──────────────────┐
                                                       │  config.ts       │
                                                       │  resolveConfig() │
                                                       └──────────────────┘
```

Приоритет: `window.__CONFIG__` > `VITE_*` env > auto-detect from `window.location`

---

## Docker

### Архитектура контейнеров

```
┌─────────────────────────────────────────────────────────────┐
│                    docker-compose.yml                        │
│                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ postgres │    │   backend    │    │    frontend      │  │
│  │ :5432    │◄───│   :8080      │◄───│    :3000 (nginx) │  │
│  │          │    │ Go + SF      │    │                  │  │
│  └──────────┘    └──────────────┘    │ /ws → backend    │  │
│                                      │ /signaling → bk  │  │
│                                      │ /api → backend   │  │
│                                      └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Запуск

```bash
# Полный стек (hybrid по умолчанию)
docker compose up -d
# → http://localhost:3000

# Только WebSocket режим
CONNECTION_MODE=websocket docker compose up -d

# Только P2P режим
CONNECTION_MODE=p2p docker compose up -d
```

### Frontend Dockerfile (multi-stage)

```
Stage 1: node:20-alpine
  → npm ci && npm run build → /app/dist

Stage 2: nginx:1.27-alpine
  → nginx.conf (proxy /ws, /signaling, /api → backend:8080)
  → docker-entrypoint.sh (ENV → /config.js)
  → dist/ → /usr/share/nginx/html
```

### Переменные окружения

**Backend:**

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `PORT` | `8080` | Порт HTTP-сервера |
| `DATABASE_URL` | `postgres://...@localhost:5432/p2p_chess` | PostgreSQL |
| `STOCKFISH_PATH` | `stockfish` | Путь к Stockfish binary |
| `FRONTEND_URL` | `http://localhost:3000` | Origin для CORS |

**Frontend:**

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `CONNECTION_MODE` | `hybrid` | Режим: `p2p`, `websocket`, `hybrid` |
| `WS_SERVER_URL` | auto-detect | WS URL бэкенда (для y-websocket) |
| `SIGNALING_SERVERS` | auto-detect | JSON-массив signaling серверов |
| `API_BASE_URL` | auto-detect | HTTP URL для REST API |

### Локальная разработка (без Docker)

```bash
# Terminal 1: PostgreSQL
docker compose up -d postgres

# Terminal 2: Backend
cd backend && go run cmd/server/main.go

# Terminal 3: Frontend (Vite dev server с proxy)
cd frontend && npm run dev
# → http://localhost:5173

# Переключение режима в dev:
VITE_CONNECTION_MODE=websocket npm run dev
```

---

## Будущее: Telegram Mini App

Приложение спроектировано для лёгкой миграции в Telegram Mini App:

| Текущее | Telegram Mini App |
|---------|-------------------|
| `nanoid()` для playerId | `Telegram.WebApp.initDataUnsafe.user.id` |
| Ручной ввод имени | Telegram user name |
| URL-sharing | Telegram deep links / inline buttons |
| Нет авторизации | Telegram `initData` validation |
| Веб-браузер | Telegram WebView (тот же движок) |

Архитектура **не требует изменений** — только клиентская адаптация:
- Конфигурация WebApp SDK
- Замена player identity
- Стилизация под Telegram UI
- Deep links для приглашения в комнату
