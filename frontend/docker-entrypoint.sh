#!/bin/sh
set -e

# Generate /config.js from environment variables at container startup.
# This allows the same Docker image to be configured differently
# without rebuilding.

CONNECTION_MODE="${CONNECTION_MODE:-hybrid}"
WS_SERVER_URL="${WS_SERVER_URL:-}"
SIGNALING_SERVERS="${SIGNALING_SERVERS:-}"
API_BASE_URL="${API_BASE_URL:-}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__CONFIG__ = {
  connectionMode: "${CONNECTION_MODE}",
  ${WS_SERVER_URL:+wsServerUrl: \"${WS_SERVER_URL}\",}
  ${SIGNALING_SERVERS:+signalingServers: ${SIGNALING_SERVERS},}
  ${API_BASE_URL:+apiBaseUrl: \"${API_BASE_URL}\",}
};
console.log("[config.js] Runtime config loaded:", window.__CONFIG__);
EOF

echo "[entrypoint] Generated /config.js with CONNECTION_MODE=${CONNECTION_MODE}"

exec "$@"
