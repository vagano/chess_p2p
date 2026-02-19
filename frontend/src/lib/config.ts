/**
 * Runtime configuration.
 *
 * In Docker: injected via /config.js → window.__CONFIG__
 * In dev:    falls back to VITE_* env vars or auto-detected defaults.
 */

export type ConnectionMode = 'p2p' | 'websocket' | 'hybrid';

export interface AppConfig {
  /** Connection mode: "p2p" | "websocket" | "hybrid" */
  connectionMode: ConnectionMode;
  /** Backend URL for WebSocket y-websocket provider (e.g. "ws://localhost:8080") */
  wsServerUrl: string;
  /** Signaling servers for y-webrtc (e.g. ["ws://localhost:8080/signaling"]) */
  signalingServers: string[];
  /** Backend HTTP URL for REST API calls (e.g. "http://localhost:8080") */
  apiBaseUrl: string;
  /** Telegram bot username (without @) for deep links */
  tgBotUsername: string;
  /** Telegram Mini App short name for deep links */
  tgAppName: string;
}

declare global {
  interface Window {
    __CONFIG__?: Partial<AppConfig>;
  }
}

function detectDefaults(): Omit<AppConfig, 'connectionMode' | 'tgBotUsername' | 'tgAppName'> {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const httpProto = window.location.protocol;
  const host = window.location.host;

  return {
    wsServerUrl: `${proto}//${host}`,
    signalingServers: [`${proto}//${host}/signaling`],
    apiBaseUrl: `${httpProto}//${host}`,
  };
}

function resolveConfig(): AppConfig {
  const runtime = window.__CONFIG__ ?? {};
  const env = import.meta.env ?? {};
  const defaults = detectDefaults();

  const rawMode =
    runtime.connectionMode ??
    (env.VITE_CONNECTION_MODE as string) ??
    'hybrid';

  const connectionMode: ConnectionMode =
    rawMode === 'p2p' || rawMode === 'websocket' ? rawMode : 'hybrid';

  const wsServerUrl =
    runtime.wsServerUrl ??
    (env.VITE_WS_SERVER_URL as string) ??
    defaults.wsServerUrl;

  const signalingServers =
    runtime.signalingServers ??
    (env.VITE_SIGNALING_SERVERS
      ? (env.VITE_SIGNALING_SERVERS as string).split(',')
      : defaults.signalingServers);

  const apiBaseUrl =
    runtime.apiBaseUrl ??
    (env.VITE_API_BASE_URL as string) ??
    defaults.apiBaseUrl;

  const tgBotUsername =
    runtime.tgBotUsername ??
    (env.VITE_TG_BOT_USERNAME as string) ??
    '';

  const tgAppName =
    runtime.tgAppName ??
    (env.VITE_TG_APP_NAME as string) ??
    '';

  return { connectionMode, wsServerUrl, signalingServers, apiBaseUrl, tgBotUsername, tgAppName };
}

/** Singleton app config — resolved once at startup */
export const config: AppConfig = resolveConfig();

console.log('[Config]', config);
