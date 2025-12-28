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
# CHECK IF TUNNEL IS ALREADY RUNNING
# ================================
if pgrep -f "cloudflared tunnel --url http://localhost:4173" >/dev/null; then
  echo "Cloudflare tunnel already running. Exiting."
  exit 0
fi

# ================================
# START TUNNEL (DETACHED)
# ================================
echo "Starting Cloudflare Quick Tunnel..."

nohup cloudflared tunnel \
  --url http://localhost:${LOCAL_PORT} \
  --no-autoupdate \
  > "$LOG_FILE" 2>&1 &

sleep 10

# ================================
# EXTRACT URL
# ================================
TUNNEL_URL=$(grep -o 'https://.*trycloudflare.com' "$LOG_FILE" | head -n 1)

if [ -z "$TUNNEL_URL" ]; then
  echo "Failed to detect tunnel URL."
  exit 1
fi

echo "$TUNNEL_URL" | sudo tee "$URL_FILE" >/dev/null

# ================================
# SEND EMAIL (ONLY WHEN STARTED)
# ================================
echo "Cloudflare Tunnel is live at:

$TUNNEL_URL

NOTE:
This URL will change if the VM reboots or the tunnel restarts." \
| mail -s "Cloudflare Tunnel URL" "$EMAIL_TO"

echo "Tunnel started successfully."
echo "URL: $TUNNEL_URL"
