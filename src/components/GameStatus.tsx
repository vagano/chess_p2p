import type { GameState } from '../lib/gameState';
import type { Chess } from 'chess.js';

interface GameStatusProps {
  gameState: GameState;
  game: Chess;
  playerColor: 'white' | 'black' | null;
  isMyTurn: boolean;
}

export function GameStatus({ gameState, game, playerColor, isMyTurn }: GameStatusProps) {
  const renderStatus = () => {
    if (gameState.status === 'waiting') {
      return <span style={{ color: '#ff9800' }}>Waiting for opponent...</span>;
    }

    if (gameState.status === 'finished') {
      let message = '';
      switch (gameState.result) {
        case '1-0':
          message = 'White wins!';
          break;
        case '0-1':
          message = 'Black wins!';
          break;
        case '1/2-1/2':
          message = 'Draw!';
          break;
        default:
          message = 'Game over';
      }

      if (game.isCheckmate()) {
        message += ' (Checkmate)';
      } else if (game.isStalemate()) {
        message += ' (Stalemate)';
      } else if (game.isDraw()) {
        message += ' (Draw by rule)';
      }

      return <span style={{ color: '#f44336', fontWeight: 'bold' }}>{message}</span>;
    }

    // Playing
    if (game.isCheck()) {
      return <span style={{ color: '#f44336' }}>Check! {isMyTurn ? 'Your move' : "Opponent's move"}</span>;
    }

    return (
      <span style={{ color: isMyTurn ? '#4caf50' : '#666' }}>
        {isMyTurn ? 'Your move' : "Opponent's move"}
      </span>
    );
  };

  const renderMoveList = () => {
    const moves = gameState.moves;
    if (moves.length === 0) return null;

    // Parse PGN to get SAN moves
    const pgnMoves = gameState.pgn
      .replace(/\[.*?\]\s*/g, '')  // remove headers
      .replace(/\d+\.\s*/g, '')    // remove move numbers
      .replace(/\s+/g, ' ')       // normalize spaces
      .trim()
      .split(' ')
      .filter((m) => m && !['1-0', '0-1', '1/2-1/2', '*'].includes(m));

    const pairs: { num: number; white: string; black?: string }[] = [];
    for (let i = 0; i < pgnMoves.length; i += 2) {
      pairs.push({
        num: Math.floor(i / 2) + 1,
        white: pgnMoves[i],
        black: pgnMoves[i + 1],
      });
    }

    return (
      <div
        style={{
          maxHeight: '300px',
          overflowY: 'auto',
          padding: '8px',
          background: '#fafafa',
          borderRadius: '8px',
          fontSize: '13px',
          fontFamily: 'monospace',
        }}
      >
        {pairs.map((pair) => (
          <div
            key={pair.num}
            style={{
              display: 'flex',
              gap: '8px',
              padding: '2px 4px',
              borderBottom: '1px solid #eee',
            }}
          >
            <span style={{ color: '#999', width: '30px', textAlign: 'right' }}>
              {pair.num}.
            </span>
            <span style={{ width: '60px', fontWeight: 500 }}>{pair.white}</span>
            <span style={{ width: '60px', fontWeight: 500, color: '#555' }}>
              {pair.black || ''}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
      }}
    >
      {/* Status bar */}
      <div
        style={{
          padding: '12px 16px',
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>{renderStatus()}</div>
          <div style={{ fontSize: '12px', color: '#888' }}>
            You: {playerColor || 'spectator'}
          </div>
        </div>
      </div>

      {/* Player info */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          padding: '8px 16px',
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
          fontSize: '13px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>White:</span>
          <span style={{ fontWeight: 500 }}>
            {gameState.white?.name || 'Waiting...'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Black:</span>
          <span style={{ fontWeight: 500 }}>
            {gameState.black?.name || 'Waiting...'}
          </span>
        </div>
      </div>

      {/* Move list */}
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
          padding: '8px',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#888',
            textTransform: 'uppercase',
            marginBottom: '4px',
            padding: '0 8px',
          }}
        >
          Moves
        </div>
        {renderMoveList()}
      </div>
    </div>
  );
}
