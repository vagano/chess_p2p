#!/bin/sh
set -e

WS_SERVER_URL="${WS_SERVER_URL:-}"
API_BASE_URL="${API_BASE_URL:-}"
TG_BOT_USERNAME="${TG_BOT_USERNAME:-}"
TG_APP_NAME="${TG_APP_NAME:-}"

cat > /dist/config.js <<EOF
window.__CONFIG__ = {
  connectionMode: "websocket",
  ${WS_SERVER_URL:+wsServerUrl: \"${WS_SERVER_URL}\",}
  ${API_BASE_URL:+apiBaseUrl: \"${API_BASE_URL}\",}
  ${TG_BOT_USERNAME:+tgBotUsername: \"${TG_BOT_USERNAME}\",}
  ${TG_APP_NAME:+tgAppName: \"${TG_APP_NAME}\",}
};
console.log("[config.js] TMA runtime config loaded:", window.__CONFIG__);
EOF

cp -a /dist/* /srv/tma/
echo "[init] Copied TMA build to /srv/tma"
