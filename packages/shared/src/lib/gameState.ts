import * as Y from 'yjs';
import type {
  GameStatus,
  GameResult,
  GameState,
  PlayerInfo,
  PendingMove,
  SeatEntry,
} from '../types';

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function createGameDoc(): Y.Doc {
  return new Y.Doc();
}

export function getGameMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('game');
}

export function initGameState(doc: Y.Doc): void {
  const gameMap = getGameMap(doc);
  doc.transact(() => {
    gameMap.set('fen', INITIAL_FEN);
    gameMap.set('pgn', '');
    gameMap.set('moves', []);
    gameMap.set('status', 'waiting' as GameStatus);
    gameMap.set('result', '*' as GameResult);
    gameMap.set('white', null);
    gameMap.set('black', null);
    gameMap.set('lastMoveAt', 0);
    gameMap.set('pendingMove', null);
    gameMap.set('moveError', null);
  });
}

export function readGameState(doc: Y.Doc): GameState {
  const gameMap = getGameMap(doc);
  return {
    fen: (gameMap.get('fen') as string) || INITIAL_FEN,
    pgn: (gameMap.get('pgn') as string) || '',
    moves: (gameMap.get('moves') as string[]) || [],
    status: (gameMap.get('status') as GameStatus) || 'waiting',
    result: (gameMap.get('result') as GameResult) || '*',
    white: gameMap.get('white') as PlayerInfo | null,
    black: gameMap.get('black') as PlayerInfo | null,
    lastMoveAt: (gameMap.get('lastMoveAt') as number) || 0,
    pendingMove: (gameMap.get('pendingMove') as PendingMove | null) ?? null,
    moveError: (gameMap.get('moveError') as string | null) ?? null,
  };
}

/** Client: request a move via server-authoritative flow (does NOT write to moves[]) */
export function requestMove(
  doc: Y.Doc,
  uci: string,
  color: 'white' | 'black',
): void {
  const gameMap = getGameMap(doc);
  doc.transact(() => {
    gameMap.set('pendingMove', { uci, by: color, at: Date.now() } satisfies PendingMove);
    gameMap.set('moveError', null);
  });
}

/** Server only: confirm a validated move */
export function confirmMove(
  doc: Y.Doc,
  fen: string,
  pgn: string,
  uci: string,
): void {
  const gameMap = getGameMap(doc);
  doc.transact(() => {
    const currentMoves = (gameMap.get('moves') as string[]) || [];
    gameMap.set('moves', [...currentMoves, uci]);
    gameMap.set('fen', fen);
    gameMap.set('pgn', pgn);
    gameMap.set('lastMoveAt', Date.now());
    gameMap.set('pendingMove', null);
    gameMap.set('moveError', null);
    if (gameMap.get('status') === 'waiting') {
      gameMap.set('status', 'playing' as GameStatus);
    }
  });
}

/** Server only: reject an invalid move */
export function rejectMove(doc: Y.Doc, error: string): void {
  const gameMap = getGameMap(doc);
  doc.transact(() => {
    gameMap.set('pendingMove', null);
    gameMap.set('moveError', error);
  });
}

export function setGameFinished(doc: Y.Doc, result: GameResult): void {
  const gameMap = getGameMap(doc);
  doc.transact(() => {
    gameMap.set('status', 'finished' as GameStatus);
    gameMap.set('result', result);
  });
}

export function joinGame(
  doc: Y.Doc,
  player: PlayerInfo,
  color: 'white' | 'black',
): void {
  const gameMap = getGameMap(doc);
  doc.transact(() => {
    gameMap.set(color, player);
  });
}

// --- Conflict-free player seating via separate Y.Map ---

export function getPlayersMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('players');
}

export function registerPlayer(
  doc: Y.Doc,
  playerId: string,
  playerName: string,
  extra?: { telegramId?: number; username?: string; photoUrl?: string },
): void {
  const playersMap = getPlayersMap(doc);
  if (!playersMap.has(playerId)) {
    doc.transact(() => {
      playersMap.set(playerId, {
        id: playerId,
        name: playerName,
        joinedAt: Date.now(),
        ...extra,
      });
    });
  }
}

export function derivePlayerColor(
  doc: Y.Doc,
  playerId: string,
): 'white' | 'black' | null {
  const playersMap = getPlayersMap(doc);
  const entries: SeatEntry[] = [];

  playersMap.forEach((val) => {
    const entry = val as SeatEntry;
    if (entry && entry.id && entry.joinedAt) {
      entries.push(entry);
    }
  });

  entries.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));

  const idx = entries.findIndex((e) => e.id === playerId);
  if (idx === 0) return 'white';
  if (idx === 1) return 'black';
  return null;
}

export function syncSeatingToGameMap(doc: Y.Doc): void {
  const playersMap = getPlayersMap(doc);
  const gameMap = getGameMap(doc);
  const entries: SeatEntry[] = [];

  playersMap.forEach((val) => {
    const entry = val as SeatEntry;
    if (entry && entry.id && entry.joinedAt) {
      entries.push(entry);
    }
  });

  entries.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));

  doc.transact(() => {
    if (entries[0]) {
      gameMap.set('white', { id: entries[0].id, name: entries[0].name });
    }
    if (entries[1]) {
      gameMap.set('black', { id: entries[1].id, name: entries[1].name });
    }
    if (entries.length >= 2 && gameMap.get('status') === 'waiting') {
      gameMap.set('status', 'playing' as GameStatus);
    }
  });
}
