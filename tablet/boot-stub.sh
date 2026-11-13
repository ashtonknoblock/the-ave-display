#!/data/data/com.termux/files/usr/bin/sh
# Lives at ~/.termux/boot/start-display.sh. Kept tiny on purpose:
# wait for Wi-Fi, pull latest code, then hand off to the repo's script.
termux-wake-lock
cd ~/the-ave-display
i=0; while [ $i -lt 12 ]; do ping -c1 -W2 github.com >/dev/null 2>&1 && break; sleep 5; i=$((i+1)); done
git pull -q --ff-only >> ~/display.log 2>&1
exec sh tablet/start-display.sh
