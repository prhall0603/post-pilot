# PostPilot

Agency-level social media content planning + scheduling through GoHighLevel.
Generate a full year of platform-tuned posts per client (monthly batches),
review on a calendar, and schedule approved posts to GHL's Social Planner
across a rolling 3-month window.

Stack: **Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Prisma · PostgreSQL (Supabase)**

---

## 🖱️ One-click download + install + run — NO command line

1. **Install Node.js once** (only if you don't have it): click
   [nodejs.org](https://nodejs.org) → download the LTS → run it → keep
   clicking Next.
2. **Download the app code:** on the repo page, click the green **`<> Code`**
   button → **Download ZIP** → **Extract All…** (double-clicking the ZIP is
   not enough — extract it!)
3. **Open the extracted folder** and **double-click the launcher for your
   computer**:
   - 🪟 **Windows:** `START-APP.bat`
   - 🍎 **macOS:** `START-APP.command` *(if Finder complains — right-click it →
     Open With → Terminal)*
   - 🐧 **Linux:** `START-APP.sh` *(make executable once: right-click →
     Properties → Allow executing, or `chmod +x START-APP.sh`)*

   A window opens, installs everything, and asks you to **paste your database
   connection string** (find it: Supabase project → green **Connect** button →
   Session pooler URI → replace `[YOUR-PASSWORD]` with your real password —
   or just press Enter to skip and set it later).
4. **When it says `Ready`**, open **http://localhost:3000** in your browser.
   That's the app. The window must stay open while you use it — **double-click
   the launcher again anytime** to restart.

> Prefer the terminal? `node install.mjs` does the same thing.
> `--start` skips prompts; `--no-start` installs only.

## 🚀 THE one-line command — Windows, macOS, and Linux alike

Paste this single line into any terminal (PowerShell on Windows, Terminal on
macOS/Linux). It **clones the repo, installs all packages, generates the
Prisma client, and launches the app**:

```bash
git clone https://github.com/prhall0603/post-pilot.git post-pilot; cd post-pilot; npx -y pnpm@latest install; npx -y prisma@latest generate; node install.mjs --start
```

**Folder already there?** (downloaded ZIP earlier or cloned before) — cd into
it and paste just this:

```bash
npx -y pnpm@latest install; npx -y prisma@latest generate; node install.mjs --start
```

What happens: packages install (a few minutes) → the installer asks for your
**database connection string** (Supabase → green Connect button → Session
pooler URI, with your real password; Enter skips) → the dev server starts →
**your browser opens the app automatically** (when it prints `Ready`, the
address is usually http://localhost:3000). Window stays open while the app
runs; Ctrl+C stops it; re-paste the line (or double-click `START-APP.bat` /
`.command` / `.sh`) to run it again.

> Needs only **Node.js 20+** ([nodejs.org](https://nodejs.org) — bundles `npx`)
> and **Git** (git-scm.com). Reopen the terminal after installing either one.
> The `;` separators work in PowerShell *and* bash/zsh — same line everywhere.

---

## 🌐 Accessing the app in the browser

1. **Start the server** (from the project root):
   ```bash
   npx pnpm dev
   ```
2. **Open the printed URL.** On startup the server prints its addresses — open the *Local* one in any browser:
   - Development: **http://localhost:3000**
   - If port 3000 is busy, Next.js automatically picks the next free port
     (e.g. `http://localhost:3001`) — always use what's printed, never assume.
   - **From your phone / another device on the same network:** use the printed
     *Network* address (e.g. `http://192.168.x.x:3000`).
     For production (`pnpm build && pnpm start`), pass `-H 0.0.0.0` to
     `next start` to accept LAN connections.
3. **First run in the browser:**
   - You land on the product page → click **Open workspace** (top right or final CTA)
   - **"Create your agency workspace"** — any email + an 8+ character password
     (this is your PostPilot login, independent of the database)
   - The **onboarding wizard** opens: choose the database (hosted, or your
     client's own Supabase) and the GHL connection (Demo Mode / Private
     Integration token / Marketplace OAuth) — or "Skip for now"
   - You land on the dashboard with a seeded example client (Demo Mode), ready
     to explore: overview → generate a 12-month plan → calendar review →
     schedule through GHL
4. **Returning visits:** go straight to `http://localhost:3000/login` and sign
   in with the same email/password (registration closes after the first run).

**Running inside Dyad?** You don't need any of the above — the preview pane
already proxies the running dev server (its own localhost port); sign in
directly there.

---

## Running on Windows, macOS, and Linux

The app is pure TypeScript/Node — it runs identically on all three operating
systems. Use the commands for your OS below.

### Prerequisites (all OSes)

- **Node.js 18.18+** (20+ recommended) — [nodejs.org](https://nodejs.org)
- **pnpm** (`corepack enable` ships with Node) or npm/yarn
- **Git** (for the clone command; skip if you already have the code)
- A **PostgreSQL database** (Supabase project recommended)

### 1. Install & configure (all OSes)

```bash
pnpm install        # also runs `prisma generate` via postinstall
```

Create `.env.local` in the project root (or set the variable in your host):

```
DATABASE_URL="postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

Optional variables:

```
AI_API_KEY=...            # Ollama cloud key; absent → built-in demo generator
AI_BASE_URL=...           # default https://api.ollama.com/v1
AI_MODEL=...              # default gpt-oss:120b
GHL_CLIENT_ID=...         # marketplace app creds (LIVE OAuth)
GHL_CLIENT_SECRET=...
GHL_REDIRECT_URI=...
ENCRYPTION_KEY=...        # AES key for stored tokens
APP_ORIGIN=...            # absolute origin for local-media fetches
```

> **Supabase note:** direct `db.<ref>.supabase.co` hostnames are IPv6-only on
> many networks — prefer the **session pooler** URI from Supabase's Connect
> dialog. The app also auto-rewrites direct hosts to the pooler when
> connecting a BYO database.

### 2. macOS / Linux

```bash
pnpm dev             # development server (http://localhost:3000)
pnpm build && pnpm start   # production
```

Nothing else required — paths are handled with `path.join`, no case-sensitivity
issues, no shell scripts in the pipeline.

### 3. Windows (PowerShell)

```powershell
pnpm dev
```

Notes for Windows:

- Run commands from **PowerShell** or **Windows Terminal** (cmd works too).
  There are no bash-specific scripts.
- `longPaths` — if you hit `EPERM`/path-too-long errors from deep
  `node_modules` chains (pnpm), enable long paths once as admin:
  ```powershell
  Set-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1
  ```
- **Case sensitivity:** the repo is portable (no case-dependent imports), but
  keep the project in a normal NTFS location, not a WSL mount or case-sensitive
  folder mix.
- Antivirus can slow first `node_modules` install — add the project folder to
  exclusions if scans throttle it.

### 4. WSL2 (Windows alternative)

Works out of the box: install Node inside WSL, clone/copy the project inside
the WSL filesystem (not `/mnt/c`), run `pnpm dev`. The server binds to your
network interface, so reach it from Windows at the printed Network URL.

### 5. Production build (any OS)

```bash
pnpm build
pnpm start
```

The build runs on Node for Windows/macOS/Linux and any Node host (bare
server, Docker, cloud). One caveat: uploaded media is stored under
`public/uploads/` on the server's filesystem — for multi-instance
production deployments, mount that folder on shared storage or move media to
object storage.

---

## Cross-platform design notes

- All file writes use `node:path.join` + `mkdir recursive` — correct separators
  on every OS.
- No `process.platform` branches, no shell-outs, no OS-specific APIs anywhere
  in the codebase.
- Passwords/tokens use Node's built-in `crypto` (available on all platforms).
- Media URLs are built from the request origin or `APP_ORIGIN`/test base URL —
  never hardcoded localhost.

## Feature map

- `/login` — agency auth (first run creates the workspace; Demo Mode default)
- `/onboarding` — database (hosted vs client's own Supabase) + GHL connection
  (Demo / Private Integration token / Marketplace OAuth)
- `/clients`, `/clients/new` — Stage 1 onboarding wizard (sub-account, voice,
  services, 7 platforms + cadence, blackouts)
- `/dashboard` — overview, batched 12-month generation with progress,
  Needs-attention tray
- `/dashboard/calendar` — Stage 3 review/approve/schedule (tablet-friendly)
- `/dashboard/media` — media library: upload (auto-push to GHL CDN), pull from
  GHL, YouTube links
- `/dashboard/settings` — brand, sub-account, platform accounts, cadence with
  regenerate-remaining
- `/settings/agency` — GHL token health, rate-limit dashboard, token log,
  database mode