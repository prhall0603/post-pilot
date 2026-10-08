import Link from "next/link";
import {
  RiArrowRightLine,
  RiCalendarCheckLine,
  RiGlobalLine,
  RiInstagramLine,
  RiShieldKeyholeLine,
  RiSparkling2Line,
  RiStackLine,
  RiTimerFlashLine,
  RiCheckboxCircleLine,
  RiLightbulbLine,
  RiMapPinLine,
  RiChatQuoteLine,
  RiRocketLine,
  RiUserHeartLine,
} from "react-icons/ri";
import { LogoLockup, LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PLATFORMS = [
  { name: "Facebook", color: "#1877F2" },
  { name: "Instagram", color: "#E1306C" },
  { name: "LinkedIn", color: "#0A66C2" },
  { name: "Google Business", color: "#4285F4" },
  { name: "TikTok", color: "#161618" },
  { name: "YouTube", color: "#FF0000" },
  { name: "Twitter/X", color: "#0F1419" },
];

const MIX = [
  { name: "Educational", pct: 40, icon: RiLightbulbLine, color: "#4F46E5" },
  { name: "Promotional", pct: 20, icon: RiSparkling2Line, color: "#F59E0B" },
  { name: "Social proof", pct: 15, icon: RiChatQuoteLine, color: "#14B8A6" },
  { name: "Local/community", pct: 10, icon: RiMapPinLine, color: "#4285F4" },
  { name: "Holiday/seasonal", pct: 10, icon: RiCalendarCheckLine, color: "#EC4899" },
  { name: "Behind the scenes", pct: 5, icon: RiUserHeartLine, color: "#8B5CF6" },
];

const FEATURES = [
  {
    icon: RiStackLine,
    title: "One workspace, every client",
    body: "Multi-tenant agency workspace with a client switcher, per-client cadence and platform mix, and a rolling scheduling window per sub-account.",
  },
  {
    icon: RiTimerFlashLine,
    title: "12 batches, not one blob",
    body: "A year of content is generated month-by-month with retries and progress — so a hiccup in July never costs you March.",
  },
  {
    icon: RiShieldKeyholeLine,
    title: "Honest by default",
    body: "The AI never invents statistics, testimonials or awards. It writes [PLACEHOLDER] tokens your reviewer replaces before approval.",
  },
];

const STEPS = [
  {
    icon: RiRocketLine,
    title: "Onboard the client",
    body: "Brand voice, services, audience, service area, platforms and cadence, blackout dates, and the linked GHL sub-account.",
  },
  {
    icon: RiSparkling2Line,
    title: "Generate the year",
    body: "12 monthly batches tuned per platform — localized posts for Google Business, video scripts for TikTok and YouTube — each saved as drafts.",
  },
  {
    icon: RiCheckboxCircleLine,
    title: "Review and approve",
    body: "Edit inline, regenerate single posts, bulk-approve by month or filter. Replace every [PLACEHOLDER] before sign-off.",
  },
  {
    icon: RiCalendarCheckLine,
    title: "Schedule via GHL",
    body: "Approved posts upload media to the GHL CDN and land in the Social Planner across the rolling 3-month window. Failures resurface with the exact platform reason.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <LogoLockup />
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#how" className="transition hover:text-foreground">How it works</a>
            <a href="#mix" className="transition hover:text-foreground">Content mix</a>
            <a href="#platforms" className="transition hover:text-foreground">Platforms</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full shadow-lift">
              <Link href="/login">Open workspace</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-20%] left-[-8%] h-[320px] w-[320px] rounded-full bg-teal-400/10 blur-3xl" />
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
          <div className="animate-in-up">
            <Badge variant="outline" className="mb-5 rounded-full border-primary/25 bg-primary/5 px-3 py-1 text-primary">
              <RiSparkling2Line className="mr-1.5 h-3.5 w-3.5" /> Agency-level social, on autopilot
            </Badge>
            <h1 className="text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
              A full year of client social media, planned and scheduled while you sleep.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              PostPilot turns each client brief into a 12-month, platform-tuned content plan across all seven
              GoHighLevel Social Planner networks — then schedules it at the agency level, sub-account by
              sub-account.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-full shadow-lift">
                <Link href="/login">
                  Get started <RiArrowRightLine className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <a href="#how">See how it works</a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Includes a built-in Demo Mode — explore the full flow with simulated GHL and AI before connecting credentials.
            </p>
          </div>

          {/* Hero visual: product mock */}
          <div className="relative animate-in-up [animation-delay:120ms]">
            <div className="rounded-3xl border bg-white shadow-soft">
              {/* mock window bar */}
              <div className="flex items-center gap-1.5 rounded-t-3xl border-b bg-muted/60 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="ml-3 text-[11px] font-medium text-muted-foreground">
                  postpilot — content calendar demo
                </span>
              </div>
              <div className="space-y-3 p-5">
                {/* summary row */}
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                    March — 34 posts
                  </span>
                  <span className="rounded-full bg-secondary px-2.5 py-1">6 platforms tuned</span>
                </div>
                {/* post chips */}
                <div className="grid grid-cols-7 gap-1.5">
                  {[
                    { color: "#1877F2", span: 2 },
                    { color: "#E1306C", span: 3 },
                    { color: "#4285F4", span: 2 },
                    { color: "#1877F2", span: 3 },
                    { color: "#0F1419", span: 4 },
                    { color: "#E1306C", span: 2 },
                    { color: "#4285F4", span: 2 },
                  ].map((chip, i) => (
                    <div key={i} style={{ gridColumn: `span ${chip.span}` } as React.CSSProperties}>
                      <div className="rounded-lg border bg-white p-1.5">
                        <div className="mb-1 h-1.5 w-6 rounded-full" style={{ backgroundColor: chip.color }} />
                        <div className="h-1 w-full rounded-full bg-muted" />
                        <div className="mt-1 h-1 w-2/3 rounded-full bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
                {/* bigger rows */}
                <div className="space-y-2 pt-1">
                  {[
                    { c: "#1877F2", w: "Educational", t: "How rooftop solar saves money through summer peaks" },
                    { c: "#E1306C", w: "Social proof", t: "Installation day timelapse — Mesa" },
                    { c: "#4285F4", w: "Local", t: "Meet us at the Mesa Home Show this Saturday" },
                    { c: "#0F1419", w: "Educational", t: "3 solar myths, busted in 280 characters" },
                  ].map((row, i) => (
                    <div key={i} className="flex items-start gap-2.5 rounded-xl border bg-white p-2.5">
                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.c }} />
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          {row.w}
                        </div>
                        <div className="truncate text-xs font-medium text-foreground">{row.t}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* floating card */}
            <div className="absolute -bottom-6 left-4 hidden rounded-2xl border bg-white p-3 shadow-lift sm:block">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <RiCheckboxCircleLine className="h-4 w-4 text-emerald-500" />
                12/12 months scheduled to GHL
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Four steps. One autopilot.</h2>
            <p className="mt-3 text-muted-foreground">
              PostPilot keeps humans in charge of sign-off and platforms honest about their rules.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={i} className="rounded-2xl border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="mb-4 inline-flex rounded-xl bg-primary/10 p-2.5 text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
          {/* feature strips */}
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex gap-3.5 rounded-2xl border bg-card p-5 shadow-soft">
                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-500/10 text-teal-600">
                  <f.icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">{f.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Content mix */}
      <section id="mix" className="bg-gradient-to-b from-background to-background">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-20">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              A proven mix, tuned per platform.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Every month balances education, promotion and trust — then adapts: localized posts for Google
              Business, long-form scripts for YouTube, punchy BTS for TikTok. Promotional never exceeds 20%.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "Seasonal and regional awareness baked into every month",
                "Media requirements enforced before anything schedules",
                "Failed posts resurface in a Needs-attention tray with the exact platform reason",
              ].map((t, i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <RiCheckboxCircleLine className="h-4.5 w-4.5 text-primary" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border bg-white p-6 shadow-soft">
            <div className="space-y-4">
              {MIX.map((m, i) => (
                <div key={i}>
                  <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <m.icon className="h-3.5 w-3.5" style={{ color: m.color }} />
                      {m.name}
                    </span>
                    <span className="text-muted-foreground">{m.pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${m.pct}%`, backgroundColor: m.color, animationDelay: `${i * 80}ms` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Platforms */}
      <section id="platforms" className="border-t bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Every GoHighLevel Social Planner network.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Platform rules are hardcoded — character limits, media requirements, threads on X, local post types
              on Google Business.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {PLATFORMS.map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-full border bg-card px-4 py-2.5 shadow-soft"
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="text-sm font-semibold">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-[hsl(var(--sidebar-background))] py-16 lg:py-20">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative mx-auto max-w-2xl px-4 text-center sm:px-6">
          <LogoMark size={56} />
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Stop selling retainers. Start showing calendars.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-indigo-200">
            Onboard a client in minutes, review a year of content in one sitting, and let PostPilot keep the
            Social Planner full.
          </p>
          <Button asChild size="lg" className="mt-8 rounded-full bg-white text-[hsl(var(--sidebar-background))] hover:bg-indigo-50">
            <Link href="/login">
              Open your workspace <RiArrowRightLine className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <LogoLockup size={28} />
          <span>© {new Date().getFullYear()} PostPilot. Scheduling through GoHighLevel.</span>
        </div>
      </footer>
    </div>
  );
}