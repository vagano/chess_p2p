import { useState, useMemo, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import type { Square } from 'chess.js';

interface ChessBoardProps {
  position: string;
  playerColor: 'white' | 'black' | null;
  isMyTurn: boolean;
  onMove: (from: Square, to: Square, promotion?: string) => boolean;
  possibleMoves: (square: Square) => string[];
  lastMove: { from: Square; to: Square } | null;
  boardWidth?: number;
}

export function ChessBoardComponent({
  position,
  playerColor,
  isMyTurn,
  onMove,
  possibleMoves,
  lastMove,
  boardWidth = 480,
}: ChessBoardProps) {
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});

  const highlightStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    // Highlight last move
    if (lastMove) {
      styles[lastMove.from] = {
        background: 'rgba(255, 255, 0, 0.3)',
      };
      styles[lastMove.to] = {
        background: 'rgba(255, 255, 0, 0.4)',
      };
    }

    return { ...styles, ...optionSquares };
  }, [lastMove, optionSquares]);

  // v5 API: onSquareClick receives { piece, square }
  const onSquareClick = useCallback(
    (args: { piece: unknown; square: string }) => {
      const square = args.square as Square;
      if (!isMyTurn || !playerColor) return;

      // If we already have a piece selected, try to move
      if (moveFrom) {
        const success = onMove(moveFrom, square);
        setMoveFrom(null);
        setOptionSquares({});
        if (success) return;
      }

      // Select the piece and show possible moves
      const moves = possibleMoves(square);
      if (moves.length > 0) {
        const newSquares: Record<string, React.CSSProperties> = {};
        moves.forEach((m) => {
          newSquares[m] = {
            background:
              'radial-gradient(circle, rgba(0,0,0,0.15) 25%, transparent 25%)',
            borderRadius: '50%',
          };
        });
        newSquares[square] = {
          background: 'rgba(255, 255, 0, 0.4)',
        };
        setOptionSquares(newSquares);
        setMoveFrom(square);
      } else {
        setOptionSquares({});
        setMoveFrom(null);
      }
    },
    [isMyTurn, playerColor, moveFrom, onMove, possibleMoves]
  );

  // v5 API: onPieceDrop receives { piece, sourceSquare, targetSquare }
  const onPieceDrop = useCallback(
    (args: { piece: unknown; sourceSquare: string; targetSquare: string | null }): boolean => {
      if (!isMyTurn || !playerColor) return false;
      if (!args.targetSquare) return false;
      const success = onMove(args.sourceSquare as Square, args.targetSquare as Square);
      setMoveFrom(null);
      setOptionSquares({});
      return success;
    },
    [isMyTurn, playerColor, onMove]
  );

  const orientation = playerColor || 'white';

  return (
    <div style={{ width: boardWidth, maxWidth: '100%' }}>
      <Chessboard
        key={`board-${orientation}`}
        options={{
          id: 'main-board',
          position,
          boardOrientation: orientation,
          onPieceDrop,
          onSquareClick,
          squareStyles: highlightStyles,
          boardStyle: {
            borderRadius: '4px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          },
          darkSquareStyle: { backgroundColor: '#779952' },
          lightSquareStyle: { backgroundColor: '#edeed1' },
          animationDurationInMs: 200,
          allowDragging: isMyTurn && !!playerColor,
        }}
      />
    </div>
  );
}
