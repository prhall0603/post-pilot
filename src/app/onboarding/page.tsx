"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiSend } from "@/lib/apiClient";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiDatabase2Line,
  RiExternalLinkLine,
  RiGlobalLine,
  RiRocketLine,
  RiShieldKeyholeLine,
  RiSparkling2Line,
  RiInformationLine,
} from "react-icons/ri";

interface OnboardingState {
  ghlMode?: "DEMO" | "LIVE" | "PIT" | null;
  dbMode: "HOSTED" | "BYO";
  dbLabel?: string | null;
  onboarded: boolean;
  configured?: boolean;
  aiMode?: "ai" | "demo";
}

const PIT_STEPS = [
  "In GoHighLevel, open Settings → Private Integrations (as agency admin).",
  'Click "Create New Integration" — name it PostPilot.',
  "Add the scopes: locations.readonly, socialplanning.get, socialplanning.post, users.readonly.",
  "Under Access, select the sub-account(s) this workspace will manage.",
  "Save, then copy the PIT token (it starts with pit-).",
];

const BYO_STEPS = [
  "Create (or open) your own Supabase project.",
  'In the project header click "Connect" (or Project Settings → Database).',
  "Copy the Connection string / URI (Session pooler is fine).",
  "Replace [YOUR-PASSWORD] with your real database password.",
  "Paste it below — PostPilot validates it, installs the schema, and switches.",
];

function OnboardingWizard() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [selectedGhl, setSelectedGhl] = useState<"DEMO" | "PIT" | "LIVE">("DEMO");
  const [pitToken, setPitToken] = useState("");
  const [dbChoice, setDbChoice] = useState<"HOSTED" | "BYO">("HOSTED");
  const [dbUrl, setDbUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    const s = await apiGet<OnboardingState>("/api/onboarding/finish");
    setState(s);
    setSelectedGhl(s.ghlMode === "PIT" ? "PIT" : s.ghlMode === "LIVE" ? "LIVE" : "DEMO");
    setDbChoice(s.dbMode === "BYO" ? "BYO" : "HOSTED");
    void s.configured;
    void s.aiMode;
  }, []);

  useEffect(() => {
    (async () => {
      const auth = await apiGet<{ authenticated: boolean; needsOnboarding: boolean }>("/api/auth");
      if (!auth.authenticated) {
        router.replace("/login");
        return;
      }
      await load().catch(() => router.replace("/dashboard"));
    })();
  }, [router, load]);

  const saveDatabase = async () => {
    setBusy(true);
    try {
      const r = await apiSend<{ ok: boolean; dbMode: string; label?: string }>(
        "/api/onboarding/database",
        "POST",
        dbChoice === "BYO" ? { mode: "BYO", dbUrl } : { mode: "HOSTED" }
      );
      toast.success(
        r.dbMode === "BYO"
          ? "Connected to your Supabase — schema installed"
          : "Using the hosted database"
      );
      await load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Database connection failed");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveGhl = async () => {
    setBusy(true);
    try {
      if (selectedGhl === "LIVE") {
        const r = await apiSend<{ authorizeUrl?: string }>("/api/ghl/connect", "POST", { mode: "LIVE" });
        if (r.authorizeUrl) {
          window.location.href = r.authorizeUrl;
          return true;
        }
        toast.error("Marketplace credentials not configured on this deployment");
        return false;
      }
      await apiSend("/api/ghl/connect", "POST", {
        mode: selectedGhl,
        ...(selectedGhl === "PIT" ? { pitToken } : {}),
      });
      toast.success(
        selectedGhl === "PIT" ? "Private Integration connected and verified" : "Demo Mode connected"
      );
      await load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connection failed");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await apiSend("/api/onboarding/finish", "POST", {});
      setDone(true);
      toast.success("Workspace ready");
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 900);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not finish onboarding");
      setBusy(false);
    }
  };

  const skipAll = async () => {
    setBusy(true);
    try {
      await apiSend("/api/onboarding/finish", "POST", {});
      router.push("/dashboard");
      router.refresh();
    } catch {
      router.push("/dashboard");
    }
  };

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <img src="/launch-complete.svg" alt="" className="w-72" />
        <h1 className="text-2xl font-extrabold tracking-tight">Your workspace is ready</h1>
        <p className="text-sm text-muted-foreground">Taking you to the dashboard…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-background to-teal-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col items-center text-center">
          <LogoMark size={44} />
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight">Set up your workspace</h1>
          <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">
            Two choices: where your data lives, and how PostPilot talks to GoHighLevel. Both can be changed
            later; Demo everything works fully without credentials.
          </p>
        </div>

        {/* DATABASE card */}
        <section className="rounded-3xl border bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <RiDatabase2Line className="h-4 w-4 text-primary" /> Database
            </h2>
            <Badge
              variant="outline"
              className={
                state.dbMode === "BYO"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border"
              }
            >
              {state.dbMode === "BYO" ? `Client's own Supabase ✓ ${state.dbLabel || ""}` : "Hosted (this app's database)"}
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setDbChoice("HOSTED")}
              className={`rounded-xl border p-4 text-left transition ${
                dbChoice === "HOSTED" ? "border-primary bg-primary/5 shadow-lift" : "hover:border-primary/40"
              }`}
            >
              <div className="text-sm font-bold">Hosted database</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Use the app's own database — zero setup, your data lives here.
              </p>
            </button>
            <button
              onClick={() => setDbChoice("BYO")}
              className={`rounded-xl border p-4 text-left transition ${
                dbChoice === "BYO" ? "border-primary bg-primary/5 shadow-lift" : "hover:border-primary/40"
              }`}
            >
              <div className="text-sm font-bold">Client's own Supabase</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Bring your own project — your data stays in your account.
              </p>
            </button>
          </div>
          {dbChoice === "BYO" && (
            <div className="mt-4 space-y-3 animate-in-up">
              <ol className="space-y-1.5 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
                {BYO_STEPS.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-bold text-primary">{i + 1}.</span> {s}
                  </li>
                ))}
              </ol>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="dburl">Supabase connection string</Label>
                <Input
                  id="dburl"
                  data-testid="byo-db-url"
                  type="password"
                  autoComplete="off"
                  placeholder="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
                  value={dbUrl}
                  onChange={(e) => setDbUrl(e.target.value)}
                />
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <RiInformationLine className="h-3.5 w-3.5 shrink-0" />
                  Encrypted at rest before storage. Direct db.* hosts are auto-rewritten to the IPv4 pooler.
                </p>
              </div>
              <Button
                className="rounded-full"
                data-testid="save-database"
                disabled={busy || !dbUrl.trim()}
                onClick={saveDatabase}
              >
                {busy ? "Connecting…" : "Connect database"}
              </Button>
            </div>
          )}
        </section>

        {/* GHL card */}
        <section className="rounded-3xl border bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <RiGlobalLine className="h-4 w-4 text-primary" /> GoHighLevel connection
            </h2>
            <Badge
              variant="outline"
              className={
                state.ghlMode === "PIT"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : state.ghlMode === "LIVE"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
              }
            >
              {state.ghlMode === "PIT"
                ? "Private Integration ✓"
                : state.ghlMode === "LIVE"
                  ? "Marketplace OAuth ✓"
                  : "Demo Mode — simulated"}
            </Badge>
          </div>
          <div className="mt-4 space-y-2.5">
            {[
              { id: "DEMO", title: "Demo Mode (no credentials)", desc: "Fully simulated GHL — explore everything, schedule to a simulator.", icon: RiSparkling2Line },
              { id: "PIT", title: "Private Integration token", desc: "Paste a PIT token from your GHL agency settings — validated live, stored encrypted. Recommended for a single agency.", icon: RiShieldKeyholeLine },
              { id: "LIVE", title: "Marketplace App (OAuth)", desc: "Agency-level OAuth across every sub-account. Requires GHL_CLIENT_ID / GHL_CLIENT_SECRET in this deployment.", icon: RiGlobalLine },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSelectedGhl(opt.id as "DEMO" | "PIT" | "LIVE")}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
                  selectedGhl === opt.id ? "border-primary bg-primary/5 shadow-lift" : "hover:border-primary/40"
                }`}
              >
                <opt.icon className="mt-0.5 h-4.5 w-4.5 text-primary" />
                <div className="min-w-0">
                  <div className="text-sm font-bold">{opt.title}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{opt.desc}</p>
                </div>
                {selectedGhl === opt.id && <RiCheckboxCircleLine className="ml-auto h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))}
          </div>

          {selectedGhl === "PIT" && (
            <div className="mt-4 space-y-3 animate-in-up" data-testid="pit-setup">
              <ol className="space-y-1.5 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
                {PIT_STEPS.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-bold text-primary">{i + 1}.</span> {s}
                  </li>
                ))}
              </ol>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="pit">PIT token</Label>
                <Input
                  id="pit"
                  data-testid="pit-token"
                  type="password"
                  autoComplete="off"
                  placeholder="pit-…"
                  value={pitToken}
                  onChange={(e) => setPitToken(e.target.value)}
                />
              </div>
              <Button
                className="rounded-full"
                data-testid="save-pit"
                disabled={busy || !pitToken.trim()}
                onClick={saveGhl}
              >
                {busy ? "Validating…" : "Validate & connect"}
              </Button>
            </div>
          )}

          {selectedGhl === "LIVE" && (
            <div className="mt-4 animate-in-up">
              <Button className="rounded-full" data-testid="start-oauth" disabled={busy} onClick={saveGhl}>
                {busy ? "Redirecting…" : "Start GoHighLevel OAuth"}
                <RiExternalLinkLine className="ml-1.5 h-3.5 w-3.5" />
              </Button>
              {!state.configured && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700">
                  <RiCloseCircleLine className="h-3.5 w-3.5" />
                  Marketplace credentials are not set on this deployment — add GHL_CLIENT_ID and
                  GHL_CLIENT_SECRET in Dyad env vars first, or use a Private Integration token above.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Finish */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-10">
          <Button variant="ghost" className="rounded-full" onClick={skipAll} disabled={busy}>
            Skip for now — use defaults
          </Button>
          <Button className="rounded-full shadow-lift" data-testid="finish-onboarding" disabled={busy} onClick={finish}>
            <RiRocketLine className="mr-1.5 h-4 w-4" />
            Finish — open dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
        </div>
      }
    >
      <OnboardingWizard />
    </Suspense>
  );
}