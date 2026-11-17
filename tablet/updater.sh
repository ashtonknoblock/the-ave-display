#!/data/data/com.termux/files/usr/bin/sh
# Every 30s: make sure the server is running (restart it if it died).
# Every 2 min: check GitHub, pull new commits; the page live-reloads itself,
# and the server restarts if server-side files changed.
cd ~/the-ave-display
TICK=30
n=0
while true; do
  sleep $TICK
  if ! pgrep -f "node server.js" >/dev/null 2>&1; then
    echo "!!! $(date): server wasn't running, restarting it"
    nohup node server.js >> ~/display.log 2>&1 &
  fi
  n=$((n + 1)); [ $((n % 4)) -eq 0 ] || continue
  git fetch -q origin 2>/dev/null || continue
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse @{u} 2>/dev/null) || continue
  [ "$LOCAL" = "$REMOTE" ] && continue
  CHANGED=$(git diff --name-only $LOCAL $REMOTE)
  echo "--- update $(date): $(git log --oneline -1 $REMOTE)"
  git pull -q --ff-only || { echo "pull failed"; continue; }
  if echo "$CHANGED" | grep -qE '^(tablet/|lib/|server\.js|package\.json)'; then
    echo "server-side files changed, restarting"
    exec sh tablet/start-display.sh
  fi
done
