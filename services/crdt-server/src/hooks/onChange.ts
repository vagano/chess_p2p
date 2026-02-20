import type { onChangePayload } from '@hocuspocus/server';
import { validateMove } from '../validation.js';
import { updateGameState } from '../db.js';

interface PendingMove {
  uci: string;
  by: 'white' | 'black';
  at: number;
}

export async function onChange(data: onChangePayload): Promise<void> {
  const { document, documentName } = data;
  const gameMap = document.getMap('game');
  const pending = gameMap.get('pendingMove') as PendingMove | null;

  if (!pending) {
    console.log(`[onChange] doc="${documentName}" pendingMove=null (no-op)`);
    return;
  }

  console.log(`[onChange] doc="${documentName}" pending=${JSON.stringify(pending)}`);

  const moves = (gameMap.get('moves') as string[]) || [];
  const status = gameMap.get('status') as string;

  if (status === 'finished') {
    document.transact(() => {
      gameMap.set('pendingMove', null);
      gameMap.set('moveError', 'Game is already finished');
    });
    return;
  }

  const result = validateMove(moves, pending.uci, pending.by);

  if (!result.valid) {
    console.log(`[Validation] REJECTED ${pending.uci} by ${pending.by}: ${result.error}`);
    document.transact(() => {
      gameMap.set('pendingMove', null);
      gameMap.set('moveError', result.error ?? 'Invalid move');
    });
    return;
  }

  console.log(`[Validation] CONFIRMED ${pending.uci} by ${pending.by} -> ${result.fen}`);

  document.transact(() => {
    gameMap.set('moves', [...moves, pending.uci]);
    gameMap.set('fen', result.fen);
    gameMap.set('pgn', result.pgn);
    gameMap.set('lastMoveAt', Date.now());
    gameMap.set('pendingMove', null);
    gameMap.set('moveError', null);

    if (gameMap.get('status') === 'waiting') {
      gameMap.set('status', 'playing');
    }

    if (result.isGameOver && result.gameResult) {
      gameMap.set('status', 'finished');
      gameMap.set('result', result.gameResult);
    }
  });

  const newStatus = result.isGameOver ? 'finished' : (gameMap.get('status') as string);
  const newResult = result.gameResult ?? (gameMap.get('result') as string) ?? '*';

  await updateGameState(documentName, result.fen, result.pgn, newStatus, newResult).catch((err) => {
    console.error('[DB] Failed to update game state:', err);
  });
}
