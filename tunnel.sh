#!/bin/bash
set -e

# ================================
# CONFIGURATION
# ================================
LOCAL_PORT=4173
EMAIL_TO="nabinbera999@gmail.com"
LOG_FILE="/var/log/cloudflared.log"
URL_FILE="/var/run/cloudflared.url"

# ================================
# DEPENDENCY CHECK
# ================================
command -v cloudflared >/dev/null 2>&1 || {
  echo "cloudflared is not installed."
  exit 1
}

command -v mail >/dev/null 2>&1 || {
  echo "mailutils is not installed."
  exit 1
}

# ================================
# STOP ANY EXISTING TUNNEL
# ================================
echo "Stopping any existing Cloudflare tunnels..."
pkill -f "cloudflared tunnel" || true
sleep 3

# ================================
# START NEW TUNNEL (DETACHED)
# ================================
echo "Starting new Cloudflare Quick Tunnel..."

nohup cloudflared tunnel \
  --url http://localhost:${LOCAL_PORT} \
  --no-autoupdate \
  > "$LOG_FILE" 2>&1 &

sleep 10

# ================================
# EXTRACT NEW URL
# ================================
TUNNEL_URL=$(grep -o 'https://.*trycloudflare.com' "$LOG_FILE" | tail -n 1)

if [ -z "$TUNNEL_URL" ]; then
  echo "❌ Failed to detect tunnel URL."
  exit 1
fi

echo "$TUNNEL_URL" | sudo tee "$URL_FILE" >/dev/null

# ================================
# SEND EMAIL (ALWAYS)
# ================================
echo "🚀 New Cloudflare Tunnel Started

Public URL:
$TUNNEL_URL

NOTE:
This URL was regenerated during deployment and replaces the previous one." \
| mail -s "🚀 New Cloudflare Tunnel URL" "$EMAIL_TO"

echo "✅ Tunnel restarted successfully"
echo "🌍 URL: $TUNNEL_URL"
