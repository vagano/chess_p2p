import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';

export default function Home() {
  const navigate = useNavigate();
  const [joinId, setJoinId] = useState('');

  const createGame = () => {
    const roomId = nanoid(10);
    navigate(`/room/${roomId}`);
  };

  const joinGame = () => {
    const id = joinId.trim();
    if (id) navigate(`/room/${id}`);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', padding: '20px',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      color: '#e0e0e0',
    }}>
      <div style={{ fontSize: '64px', marginBottom: '12px' }}>♟</div>
      <h1 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 8px' }}>P2P Chess</h1>
      <p style={{ fontSize: '16px', color: '#888', marginBottom: '32px', textAlign: 'center' }}>
        Play chess with friends in real-time
      </p>

      <button
        onClick={createGame}
        style={{
          padding: '14px 32px', fontSize: '16px', fontWeight: 700,
          background: '#4caf50', color: '#fff', border: 'none', borderRadius: '12px',
          cursor: 'pointer', marginBottom: '24px', width: '280px',
        }}
      >
        Create New Game
      </button>

      <div style={{ display: 'flex', gap: '8px', width: '280px' }}>
        <input
          value={joinId}
          onChange={(e) => setJoinId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && joinGame()}
          placeholder="Room ID or link"
          style={{
            flex: 1, padding: '12px 16px', fontSize: '14px',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '10px', color: '#e0e0e0', outline: 'none',
          }}
        />
        <button
          onClick={joinGame}
          disabled={!joinId.trim()}
          style={{
            padding: '12px 20px', fontSize: '14px', fontWeight: 600,
            background: joinId.trim() ? '#2196f3' : '#555', color: '#fff',
            border: 'none', borderRadius: '10px', cursor: joinId.trim() ? 'pointer' : 'default',
          }}
        >
          Join
        </button>
      </div>
    </div>
  );
}
