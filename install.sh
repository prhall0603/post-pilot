#!/usr/bin/env bash
# PostPilot installer — macOS, Linux, and Windows Git-Bash.
# Works three ways:
#   1) curl -fsSL https://raw.githubusercontent.com/prhall0603/post-pilot/main/install.sh | bash
#   2) downloaded / cloned, then:  bash install.sh   (or ./install.sh)
#   3) double-click START-APP.command (mac) / START-APP.sh (linux)
#
# Installs all dependencies, sets up DATABASE_URL, then launches the app
# (start-app.mjs opens the browser automatically once the server is ready).

set -u

REPO="https://github.com/prhall0603/post-pilot.git"

say()  { echo "  $*"; }
die()  { echo "  ❌ $*" >&2; exit 1; }

echo ""
echo "  -----------------------------------------"
echo "  PostPilot install + run"
echo "  -----------------------------------------"
echo ""

# ---------------------------------------------------------------------------
# 0) Locate / fetch the app folder
#    A "real" PostPilot folder has both package.json AND prisma/schema.local.prisma
#    (stray package.json files in e.g. the home folder don't count).
# ---------------------------------------------------------------------------
is_app_dir() { [ -f ./package.json ] && [ -f ./prisma/schema.local.prisma ]; }
is_app_dir_in() { [ -f "$1/package.json" ] && [ -f "$1/prisma/schema.local.prisma" ]; }

if is_app_dir; then
  say "Found the PostPilot project in the current folder (OK)"
elif [ -d ./post-pilot ] && is_app_dir_in ./post-pilot; then
  cd ./post-pilot || die "cd post-pilot failed"
  say "Found ./post-pilot (OK)"
  say "Syncing to the latest code..."
  git fetch origin main >/dev/null 2>&1 && git reset --hard origin/main >/dev/null 2>&1 \
    && say "Updated to the latest version ✔" \
    || say "Could not update (offline/auth) - continuing with existing files."
else
  if [ -d ./post-pilot ]; then
    say "Folder ./post-pilot exists but is incomplete - repairing and syncing to latest..."
    git -C ./post-pilot reset --hard >/dev/null 2>&1 || true
    git -C ./post-pilot clean -fd prisma >/dev/null 2>&1 || true
    git -C ./post-pilot fetch origin main >/dev/null 2>&1 && \
      git -C ./post-pilot reset --hard origin/main >/dev/null 2>&1 || true
    cd ./post-pilot || die "cd post-pilot failed"
    is_app_dir && say "Repaired (OK)"
  fi
  if ! is_app_dir; then
    say "Cloning PostPilot from GitHub..."
    if [ -d ./post-pilot ] && [ "$(ls -A ./post-pilot | head -n 1)" != "" ] && ! git -C ./post-pilot rev-parse HEAD >/dev/null 2>&1; then
      die "Folder ./post-pilot exists but is incomplete - delete it, then rerun."
    fi
    if ! is_app_dir && [ ! -d ./post-pilot ]; then
      git clone "$REPO" post-pilot 2>&1 | tail -n 1 || {
        echo ""
        die "Clone failed. Most often the repo is PRIVATE, or Git is missing.
  * Private repo: run 'gh auth login' once, or make the repo public
    (GitHub -> Settings -> Danger Zone -> Change visibility)."
      }
      cd ./post-pilot || die "cd post-pilot failed"
    fi
  fi
fi

# Always run on the latest committed code
say "Syncing to the latest code..."
git fetch origin main >/dev/null 2>&1 && git reset --hard origin/main >/dev/null 2>&1 \
  && say "Updated to the latest version ✔" \
  || say "Could not update (offline/auth) - continuing with existing files."

# ---------------------------------------------------------------------------
# 1) Node.js present?
# ---------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  die "Node.js is not installed. Install Node 20+ from https://nodejs.org
  macOS:      brew install node
  Ubuntu:     sudo apt install -y nodejs npm
  ...then rerun this installer."
fi
say "Node.js $(node --version) OK"

# ---------------------------------------------------------------------------
# 2) All dependencies (pnpm via npx if pnpm is missing)
#    The postinstall hook generates the Prisma client. We never fetch
#    prisma@latest directly: v7 dropped the `generate` command.
# ---------------------------------------------------------------------------
say "Installing all dependencies (first run may take a few minutes)..."
if command -v pnpm >/dev/null 2>&1; then
  pnpm install || die "pnpm install failed - see output above."
else
  npx -y pnpm@latest install || die "install failed - see output above."
fi
say "Dependencies installed OK"

# ---------------------------------------------------------------------------
# 3) DATABASE_URL - interactive only when a terminal is available
#    (curl|bash runs with stdin redirected; falls back to /dev/tty)
# ---------------------------------------------------------------------------
if [ ! -f .env.local ]; then
  printf 'DATABASE_URL=""\n' > .env.local
fi

db_set() { grep -q 'DATABASE_URL="postgresql' .env.local 2>/dev/null; }

if db_set; then
  say "DATABASE_URL already configured OK"
else
  printf '  Press Enter now to keep data on this computer (Local Mode, zero accounts),\n  or paste a Supabase connection string to store data in the cloud instead: '
  DB_URL=""
  if [ -t 0 ]; then
    read -r DB_URL || true
  elif [ -r /dev/tty ]; then
    read -r DB_URL < /dev/tty 2>/dev/null || true
  fi
  DB_URL="$(printf '%s' "$DB_URL" | tr -d '"' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [ -n "$DB_URL" ]; then
    # rewrite direct (IPv6-only) db.* hostnames to the IPv4 session pooler
    if printf '%s' "$DB_URL" | grep -qi '@db\.'; then
      REGION="${PP_POOLER_REGION:-us-east-1}"
      REF="$(printf '%s' "$DB_URL" | sed -n 's;.*@db\.\([^.]*\)\..*;\1;p')"
      if [ -n "$REF" ]; then
        DB_URL="$(printf '%s' "$DB_URL" | sed "s;@db\.$REF\.;@aws-0-${REGION}.pooler.supabase.com.;")"
        DB_URL="$(printf '%s' "$DB_URL" | sed "s;postgres:;postgres.$REF:;")"
        say "Rewrote direct host to IPv4 session pooler (region $REGION)"
      fi
    fi
    if printf '%s' "$DB_URL" | grep -q '^postgresql://'; then
      printf 'DATABASE_URL="%s"\n' "$DB_URL" > .env.local
      say "DATABASE_URL saved to .env.local OK"
    else
      say "That does not look like a postgres:// string - skipped. Fill DATABASE_URL in .env.local by hand."
    fi
  else
    say "Local Mode selected ✔ — data will be stored on this computer (no Supabase needed)."
    say "Connect a Supabase project later via the app's onboarding wizard if you change your mind."
    if [ -t 0 ] || [ -r /dev/tty ]; then
      npx -y pnpm@latest exec prisma generate --schema prisma/schema.local.prisma
      npx -y pnpm@latest exec prisma db push --schema prisma/schema.local.prisma --skip-generate \
        && say "Local database ready ✔ (data/postpilot.db)" \
        || say "(the app will retry preparing the local database automatically on start)"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 4) Launch - foreground wrapper opens the browser automatically
# ---------------------------------------------------------------------------
say "Starting PostPilot..."
say "(the app opens in your browser automatically when the server is ready;"
say " keep this window open - Ctrl+C stops it)"
exec node start-app.mjs