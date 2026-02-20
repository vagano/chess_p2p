#!/bin/sh
set -e

CONNECTION_MODE="${CONNECTION_MODE:-hybrid}"
WS_SERVER_URL="${WS_SERVER_URL:-}"
SIGNALING_SERVERS="${SIGNALING_SERVERS:-}"
API_BASE_URL="${API_BASE_URL:-}"

cat > /dist/config.js <<EOF
window.__CONFIG__ = {
  connectionMode: "${CONNECTION_MODE}",
  ${WS_SERVER_URL:+wsServerUrl: \"${WS_SERVER_URL}\",}
  ${SIGNALING_SERVERS:+signalingServers: ${SIGNALING_SERVERS},}
  ${API_BASE_URL:+apiBaseUrl: \"${API_BASE_URL}\",}
};
console.log("[config.js] Web runtime config loaded:", window.__CONFIG__);
EOF

cp -a /dist/* /srv/web/
echo "[init] Copied web build to /srv/web with CONNECTION_MODE=${CONNECTION_MODE}"
