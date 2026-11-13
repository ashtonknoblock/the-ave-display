#!/data/data/com.termux/files/usr/bin/sh
# Runs at boot via Termux:Boot (and by hand if needed)
termux-wake-lock
cd ~/the-ave-display
echo "=== start $(date) ===" >> ~/display.log
# wait up to ~60s for the network before pulling updates
i=0; while [ $i -lt 12 ]; do ping -c1 -W2 github.com >/dev/null 2>&1 && break; sleep 5; i=$((i+1)); done
git pull >> ~/display.log 2>&1
pkill -f "node server.js" 2>/dev/null
nohup node server.js >> ~/display.log 2>&1 &
