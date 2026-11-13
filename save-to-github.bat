@echo off
title Save to GitHub
cd /d "%~dp0"
set "MSG=%*"
if "%MSG%"=="" set "MSG=Update %DATE% %TIME:~0,5%"
git add -A
git commit -m "%MSG%"
git push
echo.
echo Done. You can close this window.
pause
