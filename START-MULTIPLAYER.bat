@echo off
title SHADDAI Multiplayer Server
cd /d "%~dp0"
echo Starting SHADDAI multiplayer server...
echo Open http://localhost:8790/_LAUNCH.html in your browser (or two tabs for multiplayer).
echo Close this window to stop the server.
node mp-server.js
pause
