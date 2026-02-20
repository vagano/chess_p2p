import { useState, useMemo, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Square } from 'chess.js';

interface ChessBoardProps {
  position: string;
  playerColor: 'white' | 'black' | null;
  isMyTurn: boolean;
  isCheck: boolean;
  onMove: (from: Square, to: Square, promotion?: string) => boolean;
  possibleMoves: (square: Square) => string[];
  lastMove: { from: Square; to: Square } | null;
  kingSquare: Square | null;
  boardWidth?: number;
  isPending?: boolean;
}

function isOwnPiece(pieceType: string, playerColor: 'white' | 'black'): boolean {
  const firstChar = pieceType.charAt(0);
  return (playerColor === 'white' && firstChar === 'w') ||
         (playerColor === 'black' && firstChar === 'b');
}

export function ChessBoardComponent({
  position,
  playerColor,
  isMyTurn,
  isCheck,
  onMove,
  possibleMoves,
  lastMove,
  kingSquare,
  boardWidth = 480,
  isPending = false,
}: ChessBoardProps) {
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});

  const highlightStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    if (lastMove) {
      styles[lastMove.from] = { background: 'rgba(255, 255, 0, 0.3)' };
      styles[lastMove.to] = { background: 'rgba(255, 255, 0, 0.4)' };
    }

    if (isCheck && kingSquare) {
      styles[kingSquare] = {
        background: 'radial-gradient(ellipse at center, rgba(255, 0, 0, 0.6) 0%, rgba(255, 0, 0, 0.3) 40%, transparent 70%)',
      };
    }

    return { ...styles, ...optionSquares };
  }, [lastMove, optionSquares, isCheck, kingSquare]);

  const canDragPiece = useCallback(
    (args: { isSparePiece: boolean; piece: { pieceType: string }; square: string | null }): boolean => {
      if (!isMyTurn || !playerColor || isPending) return false;
      return isOwnPiece(args.piece.pieceType, playerColor);
    },
    [isMyTurn, playerColor, isPending],
  );

  const onSquareClick = useCallback(
    (args: { piece: unknown; square: string }) => {
      const square = args.square as Square;
      if (!isMyTurn || !playerColor || isPending) return;

      if (moveFrom) {
        const success = onMove(moveFrom, square);
        setMoveFrom(null);
        setOptionSquares({});
        if (success) return;
      }

      const moves = possibleMoves(square);
      if (moves.length > 0) {
        const newSquares: Record<string, React.CSSProperties> = {};
        moves.forEach((m) => {
          newSquares[m] = {
            background: 'radial-gradient(circle, rgba(0,0,0,0.15) 25%, transparent 25%)',
            borderRadius: '50%',
          };
        });
        newSquares[square] = { background: 'rgba(255, 255, 0, 0.4)' };
        setOptionSquares(newSquares);
        setMoveFrom(square);
      } else {
        setOptionSquares({});
        setMoveFrom(null);
      }
    },
    [isMyTurn, playerColor, moveFrom, onMove, possibleMoves, isPending],
  );

  const onPieceDrop = useCallback(
    (args: { piece: unknown; sourceSquare: string; targetSquare: string | null }): boolean => {
      if (!isMyTurn || !playerColor || isPending) return false;
      if (!args.targetSquare) return false;
      const success = onMove(args.sourceSquare as Square, args.targetSquare as Square);
      setMoveFrom(null);
      setOptionSquares({});
      return success;
    },
    [isMyTurn, playerColor, onMove, isPending],
  );

  const orientation = playerColor || 'white';

  return (
    <div style={{ width: boardWidth, maxWidth: '100%', opacity: isPending ? 0.8 : 1, transition: 'opacity 0.2s' }}>
      <Chessboard
        key={`board-${orientation}`}
        options={{
          id: 'main-board',
          position,
          boardOrientation: orientation,
          onPieceDrop,
          onSquareClick,
          canDragPiece,
          squareStyles: highlightStyles,
          boardStyle: { borderRadius: '4px', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)' },
          darkSquareStyle: { backgroundColor: '#779952' },
          lightSquareStyle: { backgroundColor: '#edeed1' },
          animationDurationInMs: 200,
          allowDragging: isMyTurn && !!playerColor && !isPending,
        }}
      />
    </div>
  );
}
