#!/data/data/com.termux/files/usr/bin/sh
# Starts the dashboard server + auto-updater. Called by the boot stub
# (~/.termux/boot/start-display.sh) after it has pulled the latest code.
cd ~/the-ave-display
LOG=~/display.log
# keep the log from growing forever
[ -f $LOG ] && [ $(wc -c < $LOG) -gt 1000000 ] && tail -n 500 $LOG > $LOG.tmp && mv $LOG.tmp $LOG
echo "=== start $(date) ($(git rev-parse --short HEAD)) ===" >> $LOG
pkill -f "node server.js" 2>/dev/null
nohup node server.js >> $LOG 2>&1 &
pkill -f "tablet/updater.sh" 2>/dev/null
nohup sh tablet/updater.sh >> $LOG 2>&1 &
