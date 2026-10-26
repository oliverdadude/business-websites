#!/bin/bash
# Double-click to open the webbiz dashboard. Keep this window open while you use it.
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is needed. Install it from https://www.python.org/downloads/ and double-click this again."
  read -r -p "Press Enter to close."
  exit 1
fi
# Optional AI replies: install quietly if possible (everything else works without it).
python3 -c "import anthropic" 2>/dev/null || python3 -m pip install --quiet --user anthropic >/dev/null 2>&1
python3 -m webbiz admin --open
