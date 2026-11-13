#!/data/data/com.termux/files/usr/bin/sh
# Checks GitHub every 2 minutes. Pulls new commits; the page live-reloads
# itself, and the server restarts if server-side files changed.
cd ~/the-ave-display
INTERVAL=120
while true; do
  sleep $INTERVAL
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
