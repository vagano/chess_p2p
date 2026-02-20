import type { AppConfig } from '@chess/shared';

declare global {
  interface Window {
    __CONFIG__?: Partial<AppConfig & { tgBotUsername: string; tgAppName: string }>;
  }
}

function detectDefaults() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const httpProto = window.location.protocol;
  const host = window.location.host;
  return {
    wsServerUrl: `${proto}//${host}/ws`,
    apiBaseUrl: `${httpProto}//${host}`,
  };
}

function resolveConfig(): AppConfig & { tgBotUsername: string; tgAppName: string } {
  const runtime = window.__CONFIG__ ?? {};
  const env = import.meta.env ?? {};
  const defaults = detectDefaults();

  return {
    connectionMode: 'websocket' as const,
    wsServerUrl: runtime.wsServerUrl ?? (env.VITE_WS_SERVER_URL as string) ?? defaults.wsServerUrl,
    signalingServers: [],
    apiBaseUrl: runtime.apiBaseUrl ?? (env.VITE_API_BASE_URL as string) ?? defaults.apiBaseUrl,
    tgBotUsername: (runtime as any).tgBotUsername ?? (env.VITE_TG_BOT_USERNAME as string) ?? '',
    tgAppName: (runtime as any).tgAppName ?? (env.VITE_TG_APP_NAME as string) ?? '',
  };
}

export const config = resolveConfig();
console.log('[TMA Config]', config);
