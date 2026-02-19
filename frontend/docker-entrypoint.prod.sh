#!/bin/sh
set -e

CONNECTION_MODE="${CONNECTION_MODE:-hybrid}"
WS_SERVER_URL="${WS_SERVER_URL:-}"
SIGNALING_SERVERS="${SIGNALING_SERVERS:-}"
API_BASE_URL="${API_BASE_URL:-}"
TG_BOT_USERNAME="${TG_BOT_USERNAME:-}"
TG_APP_NAME="${TG_APP_NAME:-}"

cat > /dist/config.js <<EOF
window.__CONFIG__ = {
  connectionMode: "${CONNECTION_MODE}",
  ${WS_SERVER_URL:+wsServerUrl: \"${WS_SERVER_URL}\",}
  ${SIGNALING_SERVERS:+signalingServers: ${SIGNALING_SERVERS},}
  ${API_BASE_URL:+apiBaseUrl: \"${API_BASE_URL}\",}
  ${TG_BOT_USERNAME:+tgBotUsername: \"${TG_BOT_USERNAME}\",}
  ${TG_APP_NAME:+tgAppName: \"${TG_APP_NAME}\",}
};
console.log("[config.js] Runtime config loaded:", window.__CONFIG__);
EOF

cp -a /dist/* /srv/
echo "[init] Copied frontend build to /srv with CONNECTION_MODE=${CONNECTION_MODE}"
