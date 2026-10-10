# PostPilot

Agency-level social media content planning + scheduling through GoHighLevel.
Generate a full year of platform-tuned posts per client (monthly batches),
review on a calendar, and schedule approved posts to GHL's Social Planner
across a rolling 3-month window.

Stack: **Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Prisma · PostgreSQL (Supabase)**

---

## 🚀 Quick start — 1 line (macOS / Linux / Git-Bash)

```bash
curl -fsSL https://raw.githubusercontent.com/prhall0603/post-pilot/main/install.sh | bash
```

That downloads the installer, clones the app, installs **all dependencies**,
asks you once to **paste your database connection string**, starts the server,
and **opens the app in your browser automatically**. Rerun any time — it
resumes where it left off (already-installed steps are skipped).

Prerequisites: **Node.js 20+** ([nodejs.org](https://nodejs.org)) and **Git**
([git-scm.com](https://git-scm.com)). If Git asks for a username/password, the
repo is private — run `gh auth login` once
([GitHub CLI](https://cli.github.com)), or make the repo public
(**Settings → Danger Zone → Change visibility**).

## 🪟 Windows — one click

1. Install **Node.js 20+** (<https://nodejs.org>) if you don't have it
2. On the repo page: green **`<> Code`** button → **Download ZIP** → **Extract All…**
3. Open the extracted folder and **double-click `START-APP.bat`**

That opens a window that installs everything, asks for your **database
connection string** (Supabase project → green **Connect** button → *Session
pooler* URI → replace `[YOUR-PASSWORD]` with your real password; press Enter
to skip and add it later), then launches the server.

PowerShell alternative (clones + runs in one line, needs Git for Windows):

```powershell
git clone https://github.com/prhall0603/post-pilot.git post-pilot; cd post-pilot; npx -y pnpm@latest install; node install.bat
```

## 🌐 Opening the app in the browser

- The launcher prints **`✓ Ready`** when the server is up and **opens your
  browser automatically** at the shown URL (usually `http://localhost:3000`).
  If it doesn't, open that URL manually.
- If port 3000 is busy, Next.js picks the next free port and **prints it** —
  always use the URL shown in your terminal.
- To use the app from a phone/other device on the same Wi-Fi: open the
  printed **Network** address instead.
- The window running the server must stay open. **Ctrl+C** stops the app —
  re-run the launcher (or the one-liner) to start again.
- Returning visits: `http://localhost:3000/login` — sign in with the email +
  password you created during first-run setup.

---

## Setup walkthrough (first run in the browser)

1. **Landing page** → **Open workspace**
2. **"Create your agency workspace"** — any email + an 8+ character password
   (this login is PostPilot's own, independent of the database)
3. **Onboarding wizard:**
   - *Database* — hosted (zero setup) or your client's own Supabase: paste
     their connection string (validated live, schema auto-installed,
     IPv6→pooler hostnames auto-rewritten, credentials encrypted at rest)
   - *GoHighLevel* — Demo Mode (no credentials) / Private Integration token
     (paste a `pit-…` token — validated live against GHL) / Marketplace
     OAuth (needs `GHL_CLIENT_ID` + `GHL_CLIENT_SECRET` env)
4. Dashboard opens with a worked example client (Demo Mode) — generate a
   12-month plan, review on the calendar, and schedule approved posts to GHL.

## Configuration (all optional — Demo Mode works with none)

```
DATABASE_URL="postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres"
AI_API_KEY=...            # Ollama cloud; absent → built-in demo generator
AI_BASE_URL=...           # default https://api.ollama.com/v1
AI_MODEL=...              # default gpt-oss:120b
GHL_CLIENT_ID=...         # marketplace app (LIVE OAuth)
GHL_CLIENT_SECRET=...
GHL_REDIRECT_URI=...
ENCRYPTION_KEY=...        # AES key for stored tokens
APP_ORIGIN=...            # absolute origin, for local-media fetches
```

> **Supabase tip:** direct `db.<ref>.supabase.co` hosts are IPv6-only on many
> networks. Use the **session pooler** URI from Supabase's Connect dialog —
> and any `database_url` with a direct host is rewritten to the pooler
> automatically during install/onboarding.

## Tech notes (portability + production)

- Runs identically on **Windows, macOS, Linux** (Next.js + Node only; no
  platform branches, `node:path` everywhere, no shell scripts required).
- Uploads live under `public/uploads/` on the server filesystem — for
  multi-instance production, move that folder to object storage.
- Production build: `pnpm build` + `pnpm start` (add `-H 0.0.0.0` for LAN
  access).