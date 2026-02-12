import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';

export function Home() {
  const navigate = useNavigate();
  const [joinRoomId, setJoinRoomId] = useState('');

  const handleCreateRoom = () => {
    const roomId = nanoid(10);
    navigate(`/room/${roomId}`);
  };

  const handleJoinRoom = () => {
    const id = joinRoomId.trim();
    if (id) {
      navigate(`/room/${id}`);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        color: '#fff',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          maxWidth: '440px',
          width: '100%',
        }}
      >
        {/* Logo / Title */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ fontSize: '64px', marginBottom: '8px' }}>&#9816;</div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, margin: '0 0 8px' }}>
            P2P Chess
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            Peer-to-peer chess powered by WebRTC &amp; CRDT
          </p>
        </div>

        {/* Create room */}
        <button
          onClick={handleCreateRoom}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '18px',
            fontWeight: 700,
            border: 'none',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #e94560 0%, #c73659 100%)',
            color: '#fff',
            cursor: 'pointer',
            marginBottom: '20px',
            boxShadow: '0 4px 16px rgba(233, 69, 96, 0.4)',
            transition: 'transform 0.15s',
          }}
          onMouseDown={(e) => ((e.target as HTMLElement).style.transform = 'scale(0.98)')}
          onMouseUp={(e) => ((e.target as HTMLElement).style.transform = 'scale(1)')}
        >
          Create New Game
        </button>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: '20px 0',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.2)' }} />
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.2)' }} />
        </div>

        {/* Join room */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Enter Room ID"
            value={joinRoomId}
            onChange={(e) => setJoinRoomId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
            style={{
              flex: 1,
              padding: '14px 16px',
              fontSize: '16px',
              border: '2px solid rgba(255,255,255,0.15)',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              outline: 'none',
            }}
          />
          <button
            onClick={handleJoinRoom}
            disabled={!joinRoomId.trim()}
            style={{
              padding: '14px 24px',
              fontSize: '16px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '12px',
              background: joinRoomId.trim()
                ? 'rgba(255,255,255,0.15)'
                : 'rgba(255,255,255,0.05)',
              color: joinRoomId.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
              cursor: joinRoomId.trim() ? 'pointer' : 'default',
            }}
          >
            Join
          </button>
        </div>

        {/* Footer */}
        <p
          style={{
            marginTop: '40px',
            fontSize: '12px',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          Games are played directly between peers.
          <br />
          Server is used only as fallback and for validation.
        </p>
      </div>
    </div>
  );
}
