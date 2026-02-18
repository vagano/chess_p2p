import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import {
  isTelegram,
  getTelegramUser,
  getStartParam,
  showMainButton,
  hideMainButton,
  hideBackButton,
} from '../lib/telegram';

export function Home() {
  const navigate = useNavigate();
  const [joinRoomId, setJoinRoomId] = useState('');
  const tgUser = getTelegramUser();

  // Auto-redirect if opened via Telegram deep link with startapp=roomId
  useEffect(() => {
    const startParam = getStartParam();
    if (startParam) {
      navigate(`/room/${startParam}`);
    }
  }, [navigate]);

  // Telegram MainButton: "Create New Game"
  useEffect(() => {
    if (!isTelegram()) return;
    hideBackButton();
    showMainButton('Create New Game', () => {
      navigate(`/room/${nanoid(10)}`);
    });
    return () => hideMainButton();
  }, [navigate]);

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
        background: 'var(--tg-theme-bg-color, linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        color: 'var(--tg-theme-text-color, #fff)',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          maxWidth: '440px',
          width: '100%',
        }}
      >
        {/* User greeting (Telegram) */}
        {tgUser && (
          <div style={{ marginBottom: '16px', fontSize: '14px', opacity: 0.7 }}>
            Hi, {tgUser.first_name}!
          </div>
        )}

        {/* Logo / Title */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ fontSize: '64px', marginBottom: '8px' }}>&#9816;</div>
          <h1 style={{ fontSize: '36px', fontWeight: 800, margin: '0 0 8px' }}>
            P2P Chess
          </h1>
          <p style={{ fontSize: '16px', opacity: 0.6, margin: 0 }}>
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
            background: 'var(--tg-theme-button-color, linear-gradient(135deg, #e94560 0%, #c73659 100%))',
            color: 'var(--tg-theme-button-text-color, #fff)',
            cursor: 'pointer',
            marginBottom: '20px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
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
          <div style={{ flex: 1, height: '1px', background: 'var(--tg-theme-hint-color, rgba(255,255,255,0.2))' }} />
          <span style={{ fontSize: '13px', color: 'var(--tg-theme-hint-color, rgba(255,255,255,0.4))' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--tg-theme-hint-color, rgba(255,255,255,0.2))' }} />
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
              border: '2px solid var(--tg-theme-hint-color, rgba(255,255,255,0.15))',
              borderRadius: '12px',
              background: 'var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.08))',
              color: 'var(--tg-theme-text-color, #fff)',
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
                ? 'var(--tg-theme-button-color, rgba(255,255,255,0.15))'
                : 'rgba(128,128,128,0.1)',
              color: joinRoomId.trim()
                ? 'var(--tg-theme-button-text-color, #fff)'
                : 'var(--tg-theme-hint-color, rgba(255,255,255,0.3))',
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
            color: 'var(--tg-theme-hint-color, rgba(255,255,255,0.3))',
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
