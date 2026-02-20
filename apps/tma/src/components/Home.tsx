import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { getTelegramUser, showMainButton, hideMainButton } from '../lib/telegram';

export default function Home() {
  const navigate = useNavigate();
  const tgUser = getTelegramUser();

  useEffect(() => {
    showMainButton('Create New Game', () => {
      const roomId = nanoid(10);
      navigate(`/room/${roomId}`);
    });
    return () => hideMainButton();
  }, [navigate]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', padding: '20px',
      color: 'var(--tg-theme-text-color, #fff)',
      background: 'var(--tg-theme-bg-color, #1a1a2e)',
    }}>
      {tgUser && (
        <div style={{ fontSize: '18px', marginBottom: '12px', fontWeight: 600 }}>
          Hi, {tgUser.first_name}!
        </div>
      )}
      <div style={{ fontSize: '48px', marginBottom: '8px' }}>♟</div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 8px' }}>P2P Chess</h1>
      <p style={{ fontSize: '14px', color: 'var(--tg-theme-hint-color, #888)', textAlign: 'center' }}>
        Tap the button below to create a new game
      </p>
    </div>
  );
}
