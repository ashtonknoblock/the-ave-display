#!/data/data/com.termux/files/usr/bin/sh
LOG=/sdcard/Download/ave-setup.log
DONE=/sdcard/Download/ave-setup.done
rm -f $DONE
exec > $LOG 2>&1
set -x
export DEBIAN_FRONTEND=noninteractive
termux-wake-lock
yes | pkg update -y -o Dpkg::Options::=--force-confnew
yes | pkg upgrade -y -o Dpkg::Options::=--force-confnew
pkg install -y -o Dpkg::Options::=--force-confnew nodejs-lts git
node -v; git --version
cd ~
if [ -d the-ave-display ]; then cd the-ave-display && git pull; else git clone https://github.com/ashtonknoblock/the-ave-display.git && cd the-ave-display; fi
git log --oneline -3
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-display.sh <<'BOOT'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd ~/the-ave-display
git pull >> ~/display.log 2>&1
pkill -f "node server.js"
nohup node server.js >> ~/display.log 2>&1 &
BOOT
chmod +x ~/.termux/boot/start-display.sh
sh ~/.termux/boot/start-display.sh
sleep 4
curl -s -o /dev/null -w "local server HTTP %{http_code}\n" http://localhost:3000/
echo SETUP_FINISHED
touch $DONE
