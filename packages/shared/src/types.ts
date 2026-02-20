export type ConnectionMode = 'p2p' | 'websocket' | 'hybrid';

export interface AppConfig {
  connectionMode: ConnectionMode;
  wsServerUrl: string;
  signalingServers: string[];
  apiBaseUrl: string;
}

export type GameStatus = 'waiting' | 'playing' | 'finished';
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export interface PlayerInfo {
  id: string;
  name: string;
}

export interface PendingMove {
  uci: string;
  by: 'white' | 'black';
  at: number;
}

export interface GameState {
  fen: string;
  pgn: string;
  moves: string[];
  status: GameStatus;
  result: GameResult;
  white: PlayerInfo | null;
  black: PlayerInfo | null;
  lastMoveAt: number;
  pendingMove: PendingMove | null;
  moveError: string | null;
}

export interface SeatEntry {
  id: string;
  name: string;
  joinedAt: number;
  telegramId?: number;
  username?: string;
  photoUrl?: string;
}

export interface EvalResult {
  scoreCp: number;
  isMate: boolean;
  mateIn: number | null;
  bestMove: string | null;
  depth: number;
  source: 'stockfish' | 'material';
}
