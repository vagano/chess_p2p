import type { GameState } from '../lib/gameState';
import type { Chess } from 'chess.js';

interface GameStatusProps {
  gameState: GameState;
  game: Chess;
  playerColor: 'white' | 'black' | null;
  isMyTurn: boolean;
  isCheck: boolean;
}

const card: React.CSSProperties = {
  padding: '10px 14px',
  background: 'var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.06))',
  borderRadius: '10px',
  color: 'var(--tg-theme-text-color, #e0e0e0)',
};

export function GameStatus({ gameState, game, playerColor, isMyTurn, isCheck }: GameStatusProps) {
  const renderStatus = () => {
    if (gameState.status === 'waiting') {
      return <span style={{ color: '#ff9800' }}>Waiting for opponent...</span>;
    }

    if (gameState.status === 'finished') {
      let message = '';
      switch (gameState.result) {
        case '1-0': message = 'White wins!'; break;
        case '0-1': message = 'Black wins!'; break;
        case '1/2-1/2': message = 'Draw!'; break;
        default: message = 'Game over';
      }
      if (game.isCheckmate()) message += ' (Checkmate)';
      else if (game.isStalemate()) message += ' (Stalemate)';
      else if (game.isDraw()) message += ' (Draw by rule)';

      return <span style={{ color: '#ef5350', fontWeight: 700 }}>{message}</span>;
    }

    if (isCheck) {
      return (
        <span style={{ color: '#ef5350', fontWeight: 700 }}>
          ⚠ Check! {isMyTurn ? 'Your move' : "Opponent's move"}
        </span>
      );
    }

    return (
      <span style={{ color: isMyTurn ? '#66bb6a' : 'var(--tg-theme-hint-color, #888)' }}>
        {isMyTurn ? 'Your move' : "Opponent's move"}
      </span>
    );
  };

  const renderMoveList = () => {
    const moves = gameState.moves;
    if (moves.length === 0) {
      return (
        <div style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color, #666)', padding: '8px 0' }}>
          No moves yet
        </div>
      );
    }

    const pgnMoves = gameState.pgn
      .replace(/\[.*?\]\s*/g, '')
      .replace(/\d+\.\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter((m) => m && !['1-0', '0-1', '1/2-1/2', '*'].includes(m));

    const pairs: { num: number; white: string; black?: string }[] = [];
    for (let i = 0; i < pgnMoves.length; i += 2) {
      pairs.push({ num: Math.floor(i / 2) + 1, white: pgnMoves[i], black: pgnMoves[i + 1] });
    }

    return (
      <div
        style={{
          maxHeight: '180px',
          overflowY: 'auto',
          fontSize: '12px',
          fontFamily: "'SF Mono', 'Fira Code', monospace",
        }}
      >
        {pairs.map((pair) => (
          <div
            key={pair.num}
            style={{
              display: 'flex',
              gap: '6px',
              padding: '3px 0',
              borderBottom: '1px solid var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.06))',
            }}
          >
            <span style={{ color: 'var(--tg-theme-hint-color, #666)', width: '24px', textAlign: 'right', flexShrink: 0 }}>
              {pair.num}.
            </span>
            <span style={{ width: '52px', fontWeight: 500 }}>{pair.white}</span>
            <span style={{ width: '52px', fontWeight: 500, opacity: pair.black ? 1 : 0.3 }}>
              {pair.black || '...'}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {/* Status + turn */}
      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '14px' }}>{renderStatus()}</div>
        <div style={{ fontSize: '11px', color: 'var(--tg-theme-hint-color, #888)', opacity: 0.8 }}>
          {playerColor === 'white' ? '♔' : playerColor === 'black' ? '♚' : '👁'}{' '}
          {playerColor || 'spectator'}
        </div>
      </div>

      {/* Players */}
      <div style={{ ...card, fontSize: '13px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: 'var(--tg-theme-hint-color, #888)' }}>♔ White</span>
          <span style={{ fontWeight: 600 }}>{gameState.white?.name || '...'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--tg-theme-hint-color, #888)' }}>♚ Black</span>
          <span style={{ fontWeight: 600 }}>{gameState.black?.name || '...'}</span>
        </div>
      </div>

      {/* Move list */}
      <div style={card}>
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--tg-theme-hint-color, #888)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '6px',
        }}>
          Moves
        </div>
        {renderMoveList()}
      </div>
    </div>
  );
}
