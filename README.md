# PostPilot

Agency-level social media content planning + scheduling through GoHighLevel.
Generate a full year of platform-tuned posts per client (monthly batches),
review on a calendar, and schedule approved posts to GHL's Social Planner
across a rolling 3-month window.

Stack: **Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Prisma · PostgreSQL (Supabase)**

---

## 🚀 One-line install from GitHub (Windows / macOS / Linux)

Paste this single line into **PowerShell** (Windows), **Terminal** (macOS), or
**bash/zsh** (Linux). It clones the repo, installs every package, generates
the Prisma client, and tells you how to start:

```bash
bash -c "$(git clone https://github.com/prhall0603/post-pilot.git post-pilot 2>/dev/null && cd post-pilot && npx -y pnpm@latest install && npx -y prisma@latest generate && echo '✔ Installed. Next: add DATABASE_URL to .env.local (see below), then: npx pnpm dev')" || { echo '❌ Git or Node missing — install Node.js 20+ from https://nodejs.org and Git from https://git-scm.com, then rerun.'; }
```

Repo already cloned? One line from the project root installs **and starts**:

```bash
npx -y pnpm@latest install && npx -y prisma@latest generate && npx -y pnpm@latest dev
```

> Requires only **Node.js 20+** (bundles `npx`/corepack) and **Git**. The
> `postinstall` hook regenerates Prisma automatically either way.

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