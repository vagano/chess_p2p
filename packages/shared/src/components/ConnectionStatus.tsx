import type { ConnectionState } from '../lib/connectionManager';

interface ConnectionStatusProps {
  state: ConnectionState;
  peerCount: number;
}

const stateConfig: Record<ConnectionState, { label: string; color: string }> = {
  P2P_CONNECTED: { label: 'P2P', color: '#4caf50' },
  P2P_CONNECTING: { label: 'Connecting...', color: '#ff9800' },
  WS_CONNECTED: { label: 'Server', color: '#2196f3' },
  WS_CONNECTING: { label: 'Connecting...', color: '#ff9800' },
  WS_FALLBACK: { label: 'Relay', color: '#2196f3' },
  RECONNECTING: { label: 'Reconnecting...', color: '#f44336' },
  DISCONNECTED: { label: 'Offline', color: '#9e9e9e' },
};

export function ConnectionStatus({ state, peerCount }: ConnectionStatusProps) {
  const cfg = stateConfig[state];

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '12px',
        background: 'var(--tg-theme-secondary-bg-color, rgba(0,0,0,0.06))',
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--tg-theme-hint-color, #888)',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: cfg.color,
          display: 'inline-block',
          boxShadow: `0 0 4px ${cfg.color}`,
        }}
      />
      <span>{cfg.label}</span>
      {peerCount > 0 && (
        <span style={{ opacity: 0.7, fontSize: '11px' }}>({peerCount})</span>
      )}
    </div>
  );
}
