import { Chess } from 'chess.js';

export interface ValidationResult {
  valid: boolean;
  fen: string;
  pgn: string;
  error?: string;
  isGameOver: boolean;
  gameResult: string | null;
}

/**
 * Replay all confirmed moves, then validate the pending move.
 * Returns new FEN/PGN if valid, or an error message.
 */
export function validateMove(
  confirmedMoves: string[],
  pendingUci: string,
  expectedColor: 'white' | 'black',
): ValidationResult {
  const chess = new Chess();

  for (const uci of confirmedMoves) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci[4] || undefined;
    const result = chess.move({ from, to, promotion });
    if (!result) {
      return {
        valid: false,
        fen: chess.fen(),
        pgn: chess.pgn(),
        error: `Corrupted game state at move: ${uci}`,
        isGameOver: false,
        gameResult: null,
      };
    }
  }

  const currentTurn = chess.turn() === 'w' ? 'white' : 'black';
  if (currentTurn !== expectedColor) {
    return {
      valid: false,
      fen: chess.fen(),
      pgn: chess.pgn(),
      error: `Not your turn (expected ${currentTurn}, got ${expectedColor})`,
      isGameOver: false,
      gameResult: null,
    };
  }

  const from = pendingUci.slice(0, 2);
  const to = pendingUci.slice(2, 4);
  const promotion = pendingUci[4] || undefined;

  try {
    const result = chess.move({ from, to, promotion });
    if (!result) {
      return {
        valid: false,
        fen: chess.fen(),
        pgn: chess.pgn(),
        error: `Illegal move: ${pendingUci}`,
        isGameOver: false,
        gameResult: null,
      };
    }
  } catch {
    return {
      valid: false,
      fen: chess.fen(),
      pgn: chess.pgn(),
      error: `Invalid move format: ${pendingUci}`,
      isGameOver: false,
      gameResult: null,
    };
  }

  let gameResult: string | null = null;
  const isGameOver = chess.isGameOver();
  if (chess.isCheckmate()) {
    gameResult = chess.turn() === 'w' ? '0-1' : '1-0';
  } else if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
    gameResult = '1/2-1/2';
  }

  return {
    valid: true,
    fen: chess.fen(),
    pgn: chess.pgn(),
    isGameOver,
    gameResult,
  };
}
