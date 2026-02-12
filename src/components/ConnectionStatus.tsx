import type { ConnectionState } from '../lib/connectionManager';

interface ConnectionStatusProps {
  state: ConnectionState;
  peerCount: number;
}

const stateConfig: Record<ConnectionState, { label: string; color: string }> = {
  P2P_CONNECTED: { label: 'P2P Connected', color: '#4caf50' },
  P2P_CONNECTING: { label: 'Connecting P2P...', color: '#ff9800' },
  WS_CONNECTED: { label: 'Server Connected', color: '#2196f3' },
  WS_CONNECTING: { label: 'Connecting...', color: '#ff9800' },
  WS_FALLBACK: { label: 'Server Relay', color: '#2196f3' },
  RECONNECTING: { label: 'Reconnecting...', color: '#f44336' },
  DISCONNECTED: { label: 'Disconnected', color: '#9e9e9e' },
};

export function ConnectionStatus({ state, peerCount }: ConnectionStatusProps) {
  const config = stateConfig[state];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        borderRadius: '20px',
        background: 'rgba(0, 0, 0, 0.05)',
        fontSize: '13px',
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: config.color,
          display: 'inline-block',
        }}
      />
      <span style={{ color: '#333' }}>{config.label}</span>
      {peerCount > 0 && (
        <span style={{ color: '#888', fontSize: '12px' }}>
          ({peerCount} peer{peerCount > 1 ? 's' : ''})
        </span>
      )}
    </div>
  );
}
