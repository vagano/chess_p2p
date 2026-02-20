// Runtime config for TMA. Override window.__CONFIG__ before the app loads.
// Example: window.__CONFIG__ = { tgBotUsername: 'MyBot', tgAppName: 'chess' };
if (typeof window !== 'undefined' && !window.__CONFIG__) {
  window.__CONFIG__ = {};
}
