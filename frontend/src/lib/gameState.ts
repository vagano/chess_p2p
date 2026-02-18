import * as Y from 'yjs';

export type GameStatus = 'waiting' | 'playing' | 'finished';
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export interface PlayerInfo {
  id: string;
  name: string;
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
}

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
  };
}

export function updateGameMove(
  doc: Y.Doc,
  fen: string,
  pgn: string,
  moveUci: string
): void {
  const gameMap = getGameMap(doc);
  doc.transact(() => {
    gameMap.set('fen', fen);
    gameMap.set('pgn', pgn);
    const currentMoves = (gameMap.get('moves') as string[]) || [];
    gameMap.set('moves', [...currentMoves, moveUci]);
    gameMap.set('lastMoveAt', Date.now());
    if (gameMap.get('status') === 'waiting') {
      gameMap.set('status', 'playing' as GameStatus);
    }
  });
}

export function setGameFinished(
  doc: Y.Doc,
  result: GameResult
): void {
  const gameMap = getGameMap(doc);
  doc.transact(() => {
    gameMap.set('status', 'finished' as GameStatus);
    gameMap.set('result', result);
  });
}

export function joinGame(
  doc: Y.Doc,
  player: PlayerInfo,
  color: 'white' | 'black'
): void {
  const gameMap = getGameMap(doc);
  doc.transact(() => {
    gameMap.set(color, player);
  });
}

// --- Conflict-free player seating via separate Y.Map ---

export interface SeatEntry {
  id: string;
  name: string;
  joinedAt: number;
  telegramId?: number;
  username?: string;
  photoUrl?: string;
}

export function getPlayersMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('players');
}

/** Each client registers themselves under their own unique key — no write conflicts. */
export function registerPlayer(
  doc: Y.Doc,
  playerId: string,
  playerName: string,
  extra?: { telegramId?: number; username?: string; photoUrl?: string }
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

/**
 * Derive color from the players map.
 * Sort by joinedAt — first arrival = white, second = black.
 */
export function derivePlayerColor(
  doc: Y.Doc,
  playerId: string
): 'white' | 'black' | null {
  const playersMap = getPlayersMap(doc);
  const entries: SeatEntry[] = [];

  playersMap.forEach((val) => {
    const entry = val as SeatEntry;
    if (entry && entry.id && entry.joinedAt) {
      entries.push(entry);
    }
  });

  // Sort by joinedAt, then by id as tiebreaker (deterministic)
  entries.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));

  const idx = entries.findIndex((e) => e.id === playerId);
  if (idx === 0) return 'white';
  if (idx === 1) return 'black';
  return null; // spectator or not yet registered
}

/** Sync the derived seating into the game map (so backend can read it).
 *  Also transitions status from 'waiting' → 'playing' once both seats are filled. */
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
    // Both players seated → game is ready to play
    if (entries.length >= 2 && gameMap.get('status') === 'waiting') {
      gameMap.set('status', 'playing' as GameStatus);
    }
  });
}
