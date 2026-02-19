import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  isCheck: boolean;
  kingSquare: Square | null;
  makeMove: (from: Square, to: Square, promotion?: string) => boolean;
  isGameOver: boolean;
  lastMove: { from: Square; to: Square } | null;
  possibleMoves: (square: Square) => string[];
}

/**
 * Replay UCI moves from the initial position.
 * Returns the number of moves successfully applied.
 */
function replayMoves(chess: Chess, moves: string[]): number {
  chess.reset();
  let applied = 0;
  for (const uci of moves) {
    const from = uci.substring(0, 2) as Square;
    const to = uci.substring(2, 4) as Square;
    const promotion = uci.length > 4 ? uci[4] : undefined;
    try {
      chess.move({ from, to, promotion });
      applied++;
    } catch {
      console.warn('[useChessGame] Replay failed at move', applied + 1, ':', uci);
      break;
    }
  }
  return applied;
}

export function useChessGame({ doc, playerColor }: UseChessGameOptions): UseChessGameReturn {
  const chessRef = useRef(new Chess());
  const [position, setPosition] = useState(INITIAL_FEN);
  const [gameState, setGameState] = useState<GameState>(readGameState(doc));
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [turnColor, setTurnColor] = useState<'w' | 'b'>('w');
  const [checkState, setCheckState] = useState(false);
  const [kingSquare, setKingSquare] = useState<Square | null>(null);
  const appliedMovesCountRef = useRef(0);

  const syncChessState = useCallback(() => {
    const chess = chessRef.current;
    setPosition(chess.fen());
    setTurnColor(chess.turn());
    const inCheck = chess.isCheck();
    setCheckState(inCheck);
    if (inCheck) {
      const board = chess.board();
      const turn = chess.turn();
      for (const row of board) {
        for (const sq of row) {
          if (sq && sq.type === 'k' && sq.color === turn) {
            setKingSquare(sq.square as Square);
            return;
          }
        }
      }
    } else {
      setKingSquare(null);
    }
  }, []);

  // Sync from Yjs doc changes (remote updates)
  useEffect(() => {
    const gameMap = getGameMap(doc);

    const observer = () => {
      const state = readGameState(doc);
      setGameState(state);

      const remoteMoves = state.moves || [];

      if (remoteMoves.length !== appliedMovesCountRef.current) {
        const applied = replayMoves(chessRef.current, remoteMoves);
        appliedMovesCountRef.current = applied;

        syncChessState();

        if (remoteMoves.length > 0) {
          const lastUci = remoteMoves[Math.min(applied, remoteMoves.length) - 1];
          if (lastUci) {
            setLastMove({
              from: lastUci.substring(0, 2) as Square,
              to: lastUci.substring(2, 4) as Square,
            });
          }
        }

        checkGameOver(state);
      }
    };

    gameMap.observeDeep(observer);
    return () => {
      gameMap.unobserveDeep(observer);
    };
  }, [doc, syncChessState]);

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

  const isMyTurn = useMemo(() => {
    if (!playerColor || gameState.status !== 'playing') return false;
    return (
      (turnColor === 'w' && playerColor === 'white') ||
      (turnColor === 'b' && playerColor === 'black')
    );
  }, [playerColor, turnColor, gameState.status]);

  const makeMove = useCallback(
    (from: Square, to: Square, promotion?: string): boolean => {
      if (!playerColor) return false;
      if (gameState.status === 'finished' || gameState.status === 'waiting') return false;

      const chess = chessRef.current;

      // Double-check it's actually this player's turn
      const myTurnNow =
        (chess.turn() === 'w' && playerColor === 'white') ||
        (chess.turn() === 'b' && playerColor === 'black');
      if (!myTurnNow) return false;

      if (chess.isGameOver()) return false;

      let move: Move | null = null;
      try {
        move = chess.move({ from, to, promotion: promotion || 'q' });
      } catch {
        return false;
      }

      if (!move) return false;

      const uci = `${move.from}${move.to}${move.promotion || ''}`;

      appliedMovesCountRef.current = (gameState.moves?.length || 0) + 1;

      updateGameMove(doc, chess.fen(), chess.pgn(), uci);

      syncChessState();
      setLastMove({ from: move.from as Square, to: move.to as Square });

      const newState = readGameState(doc);
      checkGameOver(newState);

      return true;
    },
    [doc, playerColor, gameState.status, gameState.moves, checkGameOver, syncChessState]
  );

  const possibleMoves = useCallback(
    (square: Square): string[] => {
      if (!playerColor) return [];
      const chess = chessRef.current;
      const myTurnNow =
        (chess.turn() === 'w' && playerColor === 'white') ||
        (chess.turn() === 'b' && playerColor === 'black');
      if (!myTurnNow) return [];
      if (chess.isGameOver()) return [];
      const moves = chess.moves({ square, verbose: true });
      return moves.map((m) => m.to);
    },
    [playerColor, turnColor]
  );

  return {
    game: chessRef.current,
    gameState,
    position,
    isMyTurn,
    isCheck: checkState,
    kingSquare,
    makeMove,
    isGameOver: gameState.status === 'finished',
    lastMove,
    possibleMoves,
  };
}
