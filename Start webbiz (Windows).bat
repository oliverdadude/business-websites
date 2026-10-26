@echo off
rem Double-click to open the webbiz dashboard. Keep this window open while you use it.
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m webbiz admin --open
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3 is needed. Install it from https://www.python.org/downloads/
    echo Tick "Add python.exe to PATH" during install, then double-click this again.
  ) else (
    python -m webbiz admin --open
  )
)
pause
