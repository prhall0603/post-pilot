import Link from "next/link";
import { Logo } from "@/components/logo";
import { PlatformIcon } from "@/components/platform-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Layers,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";

const platforms = [
  "facebook",
  "instagram",
  "linkedin",
  "gbp",
  "tiktok",
  "youtube",
  "twitter",
] as const;

const platformNames: Record<string, string> = {
  facebook: "Facebook Pages",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  gbp: "Google Business Profile",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "Twitter/X",
};

const steps = [
  {
    icon: Workflow,
    step: "Stage 1",
    title: "Onboard the client",
    body: "Company profile, brand voice, products & services, target audience, blackout dates — plus a searchable picker for the exact GHL sub-account.",
  },
  {
    icon: Sparkles,
    step: "Stage 2",
    title: "Generate the year",
    body: "Twelve monthly batches of platform-tailored posts using a 40/20/15/10/10/5 content-mix framework — with [PLACEHOLDER] tokens instead of invented claims.",
  },
  {
    icon: CalendarRange,
    step: "Stage 3",
    title: "Review & schedule",
    body: "Approve posts on a color-coded calendar, attach media, and queue everything into GHL's Social Planner inside the rolling 3-month window.",
  },
];

const features = [
  { icon: Layers, title: "All 7 GHL platforms", body: "Facebook, Instagram, LinkedIn, Google Business Profile, TikTok, YouTube and X — each with its own character limits, media rules, and content-mix weighting." },
  { icon: ShieldCheck, title: "Agency-safe by design", body: "Tokens encrypted at rest, per-location permissions, and a rate limiter that guarantees one client's bulk run can't starve another's scheduling." },
  { icon: Zap, title: "Never lose a post", body: "Failed publishes land in a Needs-attention tray with the exact platform rejection reason and a one-click retry — nothing is silently dropped." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link href="/login">
              <Button variant="ghost" className="rounded-full">Sign in</Button>
            </Link>
            <Link href="/login">
              <Button className="rounded-full">
                Launch workspace <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(79,70,229,0.14),transparent)]" />
        </div>
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
          <div className="animate-fade-up">
            <Badge variant="secondary" className="mb-4 rounded-full border border-primary/20 bg-accent px-3 py-1 text-accent-foreground">
              Built for agencies on GoHighLevel
            </Badge>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              A full year of client social posts,{" "}
              <span className="text-primary">planned and published on autopilot</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              PostPilot turns client intake into twelve months of platform-tailored content,
              then schedules it into GoHighLevel's Social Planner across every sub-account you manage.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login">
                <Button size="lg" className="rounded-full px-6">
                  Get started <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
              <div className="flex flex-wrap gap-2">
                {platforms.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground pp-shadow-sm"
                    title={platformNames[p]}
                    data-testid={`landing-platform-${p}`}
                  >
                    <PlatformIcon platform={p} className="h-3.5 w-3.5" />
                    {platformNames[p]}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Demo Mode included — run the entire flow with simulated GHL + AI before wiring marketplace credentials.
            </div>
          </div>

          <div className="relative animate-fade-up [animation-delay:120ms]">
            <div
              className="overflow-hidden rounded-2xl border bg-card pp-shadow-lg"
              data-testid="hero-image"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero/agency-workspace.jpg"
                alt="Bright agency workspace with a social content calendar on screen"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-5 -left-3 hidden rounded-xl border bg-card/95 px-4 py-3 text-sm pp-shadow-lg backdrop-blur sm:block">
              <div className="flex items-center gap-2 font-medium">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                Demo Mode: 5 sub-accounts connected
              </div>
              <div className="mt-1 text-muted-foreground">12 months · 7 platforms · auto-scheduling</div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border/70 bg-card/60 py-16" id="stages">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="font-display text-3xl font-semibold tracking-tight">
            Three stages, zero chaos
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Each client gets a guided pipeline: capture the brand, generate the year, review and publish — with you in control at every gate.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <div
                key={s.step}
                className="group relative rounded-2xl border bg-card p-6 pp-shadow transition-transform duration-200 hover:-translate-y-1"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="text-xs font-semibold uppercase tracking-wider text-primary">{s.step}</div>
                <h3 className="mt-1 font-display text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature band */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border bg-card p-6 pp-shadow">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-14">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">Your client calendar, flying itself</h2>
            <p className="mx-auto mt-3 max-w-xl text-primary-foreground/85">
              Create your agency workspace, connect a (simulated) GHL app, and take the first client through all three stages in minutes.
            </p>
            <Link href="/login" className="mt-8 inline-block">
              <Button size="lg" variant="secondary" className="rounded-full bg-white px-8 text-primary hover:bg-white/90">
                Launch PostPilot <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Logo mark={false} />
          <span>Agency-grade social scheduling for GoHighLevel · Demo Mode enabled</span>
        </div>
      </footer>
    </div>
  );
}