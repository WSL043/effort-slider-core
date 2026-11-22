@echo off
rem Opens the self-contained demo in the default browser.
rem No install, no build, no server: everything is inside demo.html.
setlocal
set "DEMO=%~dp0demo.html"
if not exist "%DEMO%" (
  echo demo.html is missing next to this script.
  echo Run "npm install" then "npm run build" to regenerate it.
  pause
  exit /b 1
)
start "" "%DEMO%"
exit /b 0
