#!/bin/bash
# Double-click to open the webbiz dashboard. Keep this window open while you use it.
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is needed. Install it from https://www.python.org/downloads/ and double-click this again."
  read -r -p "Press Enter to close."
  exit 1
fi
python3 -m webbiz admin --open
