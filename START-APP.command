#!/bin/bash
# PostPilot double-click launcher for macOS.
# If Finder says the file can't be opened: right-click it → Open With → Terminal.
cd "$(dirname "$0")"

echo ""
echo "  PostPilot — starting…"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  ❌ Node.js is not installed."
  echo "     1. Open https://nodejs.org and install the LTS version."
  echo "     2. Then double-click this file again."
  echo ""
  read -n 1 -s -r -p "Press any key to close…"
  exit 1
fi

echo "  ✔ Node.js $(node --version) found"
echo ""
echo "  Installing everything and starting PostPilot…"
echo "  (first run takes a few minutes — just wait)"
echo ""

node install.mjs

echo ""
echo "  ────────────────────────────────────────────"
echo "  Server stopped. Double-click again to restart."
read -n 1 -s -r -p "Press any key to close…"