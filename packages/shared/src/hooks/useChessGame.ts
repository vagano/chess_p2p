import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Chess, type Square, type Move } from 'chess.js';
import * as Y from 'yjs';
import {
  getGameMap,
  readGameState,
  requestMove,
  confirmMove,
  rejectMove,
  setGameFinished,
  INITIAL_FEN,
} from '../lib/gameState';
import type { GameState, GameResult } from '../types';

const PENDING_MOVE_TIMEOUT_MS = 5000;

interface UseChessGameOptions {
  doc: Y.Doc;
  playerColor: 'white' | 'black' | null;
}

export interface UseChessGameReturn {
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
  isPending: boolean;
}

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

  const [optimisticFen, setOptimisticFen] = useState<string | null>(null);
  const [optimisticLastMove, setOptimisticLastMove] = useState<{ from: Square; to: Square } | null>(null);

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

        setOptimisticFen(null);
        setOptimisticLastMove(null);

        if (remoteMoves.length > 0) {
          const lastUci = remoteMoves[Math.min(applied, remoteMoves.length) - 1];
          if (lastUci) {
            setLastMove({
              from: lastUci.substring(0, 2) as Square,
              to: lastUci.substring(2, 4) as Square,
            });
          }
        }
      }

      if (state.moveError && !state.pendingMove) {
        setOptimisticFen(null);
        setOptimisticLastMove(null);
      }
    };

    gameMap.observeDeep(observer);
    return () => {
      gameMap.unobserveDeep(observer);
    };
  }, [doc, syncChessState]);

  const isPending = !!gameState.pendingMove;

  useEffect(() => {
    const pending = gameState.pendingMove;
    if (!pending) return;

    const timer = setTimeout(() => {
      const current = readGameState(doc);
      if (!current.pendingMove || current.pendingMove.at !== pending.at) return;

      console.warn('[useChessGame] pendingMove timeout — applying client-side fallback');
      const chess = new Chess();
      const moves = current.moves || [];
      for (const uci of moves) {
        try { chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }); }
        catch { break; }
      }

      const from = pending.uci.slice(0, 2);
      const to = pending.uci.slice(2, 4);
      const promo = pending.uci[4] || undefined;
      try {
        const result = chess.move({ from, to, promotion: promo });
        if (result) {
          confirmMove(doc, chess.fen(), chess.pgn(), pending.uci);
          if (chess.isGameOver()) {
            let gameResult: GameResult = '1/2-1/2';
            if (chess.isCheckmate()) {
              gameResult = chess.turn() === 'w' ? '0-1' : '1-0';
            }
            setGameFinished(doc, gameResult);
          }
        } else {
          rejectMove(doc, 'Invalid move (client fallback)');
        }
      } catch {
        rejectMove(doc, 'Invalid move (client fallback)');
      }
    }, PENDING_MOVE_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [doc, gameState.pendingMove]);

  const isMyTurn = useMemo(() => {
    if (!playerColor || gameState.status !== 'playing') return false;
    if (isPending) return false;
    return (
      (turnColor === 'w' && playerColor === 'white') ||
      (turnColor === 'b' && playerColor === 'black')
    );
  }, [playerColor, turnColor, gameState.status, isPending]);

  const makeMove = useCallback(
    (from: Square, to: Square, promotion?: string): boolean => {
      if (!playerColor) return false;
      if (gameState.status === 'finished' || gameState.status === 'waiting') return false;
      if (isPending) return false;

      const chess = chessRef.current;

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

      const newFen = chess.fen();
      const uci = `${move.from}${move.to}${move.promotion || ''}`;

      chess.undo();

      setOptimisticFen(newFen);
      setOptimisticLastMove({ from: move.from as Square, to: move.to as Square });

      requestMove(doc, uci, playerColor);

      return true;
    },
    [doc, playerColor, gameState.status, gameState.moves, isPending],
  );

  const possibleMoves = useCallback(
    (square: Square): string[] => {
      if (!playerColor) return [];
      if (isPending) return [];
      const chess = chessRef.current;
      const myTurnNow =
        (chess.turn() === 'w' && playerColor === 'white') ||
        (chess.turn() === 'b' && playerColor === 'black');
      if (!myTurnNow) return [];
      if (chess.isGameOver()) return [];
      const moves = chess.moves({ square, verbose: true });
      return moves.map((m) => m.to);
    },
    [playerColor, turnColor, isPending],
  );

  return {
    game: chessRef.current,
    gameState,
    position: optimisticFen ?? position,
    isMyTurn,
    isCheck: checkState,
    kingSquare,
    makeMove,
    isGameOver: gameState.status === 'finished',
    lastMove: optimisticLastMove ?? lastMove,
    possibleMoves,
    isPending,
  };
}
