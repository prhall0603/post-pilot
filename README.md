# PostPilot

Agency-level social media content planning + scheduling through GoHighLevel.
Generate a full year of platform-tuned posts per client (monthly batches),
review on a calendar, and schedule approved posts to GHL's Social Planner
across a rolling 3-month window.

Stack: **Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Prisma · PostgreSQL (Supabase)**

---

## Running on Windows, macOS, and Linux

The app is pure TypeScript/Node — it runs identically on all three operating
systems. Use the commands for your OS below.

### ⚡ One-command setup (clones + installs + runs)

Paste this single line into PowerShell (Windows), Terminal (macOS), or
bash/zsh (Linux). It prints its own prerequisites if anything's missing:

```bash
bash -c "$(git clone https://github.com/YOUR-ORG/postpilot.git 2>/dev/null && cd postpilot && npx -y pnpm@latest install && npx -y prisma@latest generate && echo '✔ Dependencies installed. Run:  cd postpilot && npx pnpm dev')" || { echo '❌ Git or Node is missing — install Node.js 20 (includes corepack/pnpm support) from https://nodejs.org and Git from https://git-scm.com, then rerun this command.'; }
```

Already have the repo cloned? The one-liner below does install + generate +
dev server start in one shot from the project root:

```bash
npx -y pnpm@latest install && npx -y prisma@latest generate && npx -y pnpm@latest dev
```

(Windows note: run it in **PowerShell** — `npx` resolves identically; if
`npx` is missing, install Node.js from nodejs.org which bundles it.)

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