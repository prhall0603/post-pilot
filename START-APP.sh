#!/bin/bash
# PostPilot double-click launcher for Linux (make executable: chmod +x START-APP.sh).
cd "$(dirname "$0")"

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │  PostPilot — double-click installer     │"
echo "  └─────────────────────────────────────────┘"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  ❌ Node.js is not installed."
  echo "     Ubuntu/Debian:  sudo apt install -y nodejs npm   (or https://nodejs.org)"
  echo "     Fedora:         sudo dnf install -y nodejs"
  echo "     Then double-click this file (or run: ./START-APP.sh) again."
  echo ""
  read -n 1 -s -r -p "Press any key to close…"
  exit 1
fi

N=$(node --version); echo "  ✔ Node.js $N found"
echo ""
echo "  Installing everything and starting PostPilot…"
echo "  (first run takes a few minutes — just wait)"
echo ""

node install.mjs

echo ""
echo "  ────────────────────────────────────────────"
echo "  Server stopped. Double-click again to restart."
read -n 1 -s -r -p "Press any key to close…"