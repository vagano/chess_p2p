import type { AppConfig } from '@chess/shared';

declare global {
  interface Window {
    __CONFIG__?: Partial<AppConfig>;
  }
}

function detectDefaults() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const httpProto = window.location.protocol;
  const host = window.location.host;
  return {
    wsServerUrl: `${proto}//${host}/ws`,
    signalingServers: [`${proto}//${host}/signaling`],
    apiBaseUrl: `${httpProto}//${host}`,
  };
}

function resolveConfig(): AppConfig {
  const runtime = window.__CONFIG__ ?? {};
  const env = import.meta.env ?? {};
  const defaults = detectDefaults();

  const rawMode = runtime.connectionMode ?? (env.VITE_CONNECTION_MODE as string) ?? 'hybrid';
  const connectionMode = rawMode === 'p2p' || rawMode === 'websocket' ? rawMode : 'hybrid' as const;

  return {
    connectionMode,
    wsServerUrl: runtime.wsServerUrl ?? (env.VITE_WS_SERVER_URL as string) ?? defaults.wsServerUrl,
    signalingServers: runtime.signalingServers ?? (env.VITE_SIGNALING_SERVERS ? (env.VITE_SIGNALING_SERVERS as string).split(',') : defaults.signalingServers),
    apiBaseUrl: runtime.apiBaseUrl ?? (env.VITE_API_BASE_URL as string) ?? defaults.apiBaseUrl,
  };
}

export const config = resolveConfig();
console.log('[Web Config]', config);
