import { useState, useCallback, useRef, useEffect } from 'react';
import { Chess, Square, Move } from 'chess.js';
import * as Y from 'yjs';
import {
  getGameMap,
  readGameState,
  updateGameMove,
  setGameFinished,
  INITIAL_FEN,
  type GameState,
  type GameResult,
} from '../lib/gameState';

interface UseChessGameOptions {
  doc: Y.Doc;
  playerColor: 'white' | 'black' | null;
}

interface UseChessGameReturn {
  game: Chess;
  gameState: GameState;
  position: string;
  isMyTurn: boolean;
  makeMove: (from: Square, to: Square, promotion?: string) => boolean;
  isGameOver: boolean;
  lastMove: { from: Square; to: Square } | null;
  possibleMoves: (square: Square) => string[];
}

/**
 * Replay all UCI moves from the initial position.
 * This preserves full PGN history in chess.js (unlike chess.load(fen)
 * which loads only the position and loses the move history).
 */
function replayMoves(chess: Chess, moves: string[]): void {
  chess.reset();
  for (const uci of moves) {
    const from = uci.substring(0, 2) as Square;
    const to = uci.substring(2, 4) as Square;
    const promotion = uci.length > 4 ? uci[4] : undefined;
    try {
      chess.move({ from, to, promotion });
    } catch {
      // If a move fails, stop replaying — state might be partially synced
      console.warn('[useChessGame] Replay failed at move:', uci);
      break;
    }
  }
}

export function useChessGame({ doc, playerColor }: UseChessGameOptions): UseChessGameReturn {
  const chessRef = useRef(new Chess());
  const [position, setPosition] = useState(INITIAL_FEN);
  const [gameState, setGameState] = useState<GameState>(readGameState(doc));
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  // Track the number of moves we've applied so we know when to re-sync
  const appliedMovesCountRef = useRef(0);

  // Sync from Yjs doc changes (remote updates)
  useEffect(() => {
    const gameMap = getGameMap(doc);

    const observer = () => {
      const state = readGameState(doc);
      setGameState(state);

      const remoteMoves = state.moves || [];

      // Only re-sync if the move count changed
      if (remoteMoves.length !== appliedMovesCountRef.current) {
        // Replay ALL moves from the start to preserve full PGN history
        replayMoves(chessRef.current, remoteMoves);
        appliedMovesCountRef.current = remoteMoves.length;

        const fen = chessRef.current.fen();
        setPosition(fen);

        // Update last move indicator
        if (remoteMoves.length > 0) {
          const lastUci = remoteMoves[remoteMoves.length - 1];
          setLastMove({
            from: lastUci.substring(0, 2) as Square,
            to: lastUci.substring(2, 4) as Square,
          });
        }

        // Check game over conditions
        checkGameOver(state);
      }
    };

    gameMap.observeDeep(observer);
    return () => {
      gameMap.unobserveDeep(observer);
    };
  }, [doc]);

  const checkGameOver = useCallback(
    (state: GameState) => {
      const chess = chessRef.current;
      if (state.status === 'finished') return;

      let result: GameResult | null = null;
      if (chess.isCheckmate()) {
        result = chess.turn() === 'w' ? '0-1' : '1-0';
      } else if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
        result = '1/2-1/2';
      }

      if (result) {
        setGameFinished(doc, result);
      }
    },
    [doc]
  );

  const isMyTurn = playerColor
    ? (chessRef.current.turn() === 'w' && playerColor === 'white') ||
      (chessRef.current.turn() === 'b' && playerColor === 'black')
    : false;

  const makeMove = useCallback(
    (from: Square, to: Square, promotion?: string): boolean => {
      if (!playerColor || !isMyTurn) return false;
      if (gameState.status === 'finished') return false;

      const chess = chessRef.current;
      let move: Move | null = null;

      try {
        move = chess.move({ from, to, promotion: promotion || 'q' });
      } catch {
        return false;
      }

      if (!move) return false;

      // Build UCI notation
      const uci = `${move.from}${move.to}${move.promotion || ''}`;

      // Update applied count so observer doesn't re-replay
      appliedMovesCountRef.current = (gameState.moves?.length || 0) + 1;

      // Update Yjs doc — chess.pgn() now has full history because we replay
      updateGameMove(doc, chess.fen(), chess.pgn(), uci);

      setPosition(chess.fen());
      setLastMove({ from: move.from as Square, to: move.to as Square });

      // Check game over
      const newState = readGameState(doc);
      checkGameOver(newState);

      return true;
    },
    [doc, playerColor, isMyTurn, gameState.status, gameState.moves, checkGameOver]
  );

  const possibleMoves = useCallback(
    (square: Square): string[] => {
      if (!playerColor || !isMyTurn) return [];
      const moves = chessRef.current.moves({ square, verbose: true });
      return moves.map((m) => m.to);
    },
    [playerColor, isMyTurn]
  );

  return {
    game: chessRef.current,
    gameState,
    position,
    isMyTurn,
    makeMove,
    isGameOver: gameState.status === 'finished',
    lastMove,
    possibleMoves,
  };
}
