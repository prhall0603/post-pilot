"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiGet, apiSend } from "@/lib/apiClient";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiExternalLinkLine,
  RiGlobalLine,
  RiRefreshLine,
  RiShieldKeyholeLine,
  RiSparkling2Line,
  RiRocketLine,
  RiDashboard2Line,
  RiLogoutBoxRLine,
} from "react-icons/ri";

interface GhlStatus {
  connected: boolean;
  mode?: "DEMO" | "LIVE" | null;
  configured: boolean;
  aiMode?: "ai" | "demo";
  scope?: string | null;
  connectedAt?: string | null;
  lastRefreshedAt?: string | null;
  expiresAt?: string | null;
  lastError?: string | null;
  tokenType?: string | null;
  events: Array<{ id: string; kind: string; detail?: string | null; createdAt: string }>;
  limiter: {
    maxConcurrent: number;
    active: number;
    queued: number;
    rateLimitedEvents: number;
    activeByLocation: Array<{ locationId: string; active: number }>;
  };
}
interface Agency {
  id: string;
  email: string;
  demoMode: boolean;
}

function AgencySettings() {
  const params = useSearchParams();
  const [status, setStatus] = useState<GhlStatus | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([
      apiGet<GhlStatus>("/api/ghl/status"),
      apiGet<{ agency: Agency }>("/api/agency"),
    ]);
    setStatus(s);
    setAgency(a.agency);
  }, []);

  useEffect(() => {
    load().catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"));
    // surface callback result banners
    const result = params.get("ghl");
    if (result === "connected") toast.success("GHL connected — agency tokens stored encrypted");
    if (result === "denied") toast.error("GHL authorization was denied");
    if (result === "not_configured") toast.error("GHL credentials not configured in environment");
    if (result === "error") toast.error("GHL token exchange failed — see the log below");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectDemo = async () => {
    setConnecting(true);
    try {
      await apiSend("/api/ghl/connect", "POST", { demo: true });
      toast.success("Demo Mode connected — simulated GHL active");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setConnecting(false);
    }
  };

  const connectLive = async () => {
    setConnecting(true);
    try {
      const r = await apiSend<{ demo: boolean; authorizeUrl?: string }>("/api/ghl/connect", "POST", { demo: false });
      if (r.authorizeUrl) {
        window.location.href = r.authorizeUrl; // full redirect to GHL consent screen
      } else {
        toast.error("Live connect unavailable — configure GHL credentials first");
        setConnecting(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connect failed");
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect GHL and revert to Demo Mode?")) return;
    setBusy(true);
    try {
      await apiSend("/api/ghl/disconnect", "POST", {});
      toast.success("Disconnected — reverted to Demo Mode");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleDemo = async (demoMode: boolean) => {
    try {
      await apiSend("/api/agency", "PATCH", { demoMode });
      toast.success(demoMode ? "Demo Mode on — simulated GHL & AI" : "Live mode — real GHL and AI in use");
      setAgency((a) => (a ? { ...a, demoMode } : a));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    }
  };

  const signOut = async () => {
    await apiSend("/api/auth", "POST", { action: "logout" });
    window.location.href = "/login";
  };

  if (!status || !agency) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
      </div>
    );
  }

  const modeLabel =
    status.mode === "LIVE"
      ? "Live — real GoHighLevel"
      : status.mode === "DEMO"
        ? "Demo Mode — simulated"
        : "Not connected";

  return (
    <div className="min-h-screen bg-background">
      {/* Header bar */}
      <div className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2.5 transition hover:opacity-80">
            <LogoMark size={30} />
            <span className="text-sm font-extrabold">PostPilot</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground">
              <RiDashboard2Line className="h-3.5 w-3.5" /> Dashboard
            </Link>
            <span className="text-xs text-muted-foreground">{agency.email}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={signOut} title="Sign out">
              <RiLogoutBoxRLine className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Agency settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            GHL marketplace connection, token health, rate limits, and workspace mode.
          </p>
        </div>

        {/* GHL connection */}
        <section className="rounded-3xl border bg-white p-6 shadow-soft" data-testid="ghl-connection">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <RiGlobalLine className="h-4 w-4 text-primary" /> GoHighLevel connection
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Agency-level marketplace app. Tokens are AES-256-GCM encrypted at rest and refreshed automatically.
              </p>
            </div>
            <Badge
              variant="outline"
              data-testid="ghl-status-badge"
              className={
                status.mode === "LIVE"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : status.mode === "DEMO"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border"
              }
            >
              {status.mode === "LIVE" && <RiCheckboxCircleLine className="mr-1 h-3 w-3" />}
              {status.mode === "DEMO" && <RiSparkling2Line className="mr-1 h-3 w-3" />}
              {modeLabel}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
            <div className="rounded-xl bg-secondary p-3">
              <div className="font-semibold text-foreground">Credentials in env</div>
              <div className="mt-1 flex items-center gap-1.5">
                {status.configured ? <RiCheckboxCircleLine className="h-3.5 w-3.5 text-emerald-600" /> : <RiCloseCircleLine className="h-3.5 w-3.5 text-amber-600" />}
                {status.configured ? "GHL_CLIENT_ID/SECRET present" : "missing — Demo Mode available"}
              </div>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <div className="font-semibold text-foreground">Scopes</div>
              <div className="mt-1 font-mono text-[10px]">{status.scope || "locations.readonly socialplanning.get socialplanning.post users.readonly"}</div>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <div className="font-semibold text-foreground">Token health</div>
              <div className="mt-1">
                {status.lastError ? (
                  <span className="text-red-600">{status.lastError.slice(0, 60)}</span>
                ) : status.lastRefreshedAt ? (
                  `refreshed ${new Date(status.lastRefreshedAt).toLocaleString()}`
                ) : (
                  "no refresh yet"
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {status.mode !== "LIVE" ? (
              <>
                <Button className="rounded-full shadow-lift" onClick={connectLive} disabled={connecting} data-testid="connect-ghl">
                  {connecting ? "Redirecting…" : "Connect GoHighLevel"}
                  <RiExternalLinkLine className="ml-1.5 h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" className="rounded-full" onClick={connectDemo} disabled={connecting} data-testid="connect-demo">
                  <RiSparkling2Line className="mr-1.5 h-3.5 w-3.5" /> Connect in Demo Mode
                </Button>
              </>
            ) : (
              <Button variant="outline" className="rounded-full" onClick={disconnect} disabled={busy}>
                Disconnect (revert to Demo)
              </Button>
            )}
          </div>
        </section>

        {/* Demo mode toggle */}
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border bg-white p-6 shadow-soft">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <RiRocketLine className="h-4 w-4 text-primary" /> Demo Mode
            </h2>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Simulated GHL + built-in AI demo generator so the full onboarding → generation → scheduling flow runs
              before marketplace credentials exist.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">{agency.demoMode ? "On" : "Off"}</span>
            <Switch checked={agency.demoMode} onCheckedChange={toggleDemo} data-testid="demo-mode-toggle" />
          </div>
        </section>

        {/* Rate-limit dashboard */}
        <section className="rounded-3xl border bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <RiDashboard2Line className="h-4 w-4 text-primary" /> Rate limits
            </h2>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={load}>
              <RiRefreshLine className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-secondary p-4">
              <div className="text-2xl font-extrabold" data-testid="limiter-active">{status.limiter.active}</div>
              <div className="text-[11px] text-muted-foreground">active of {status.limiter.maxConcurrent} max concurrent</div>
              <Progress className="mt-2 h-1.5" value={(status.limiter.active / status.limiter.maxConcurrent) * 100} />
            </div>
            <div className="rounded-xl bg-secondary p-4">
              <div className="text-2xl font-extrabold" data-testid="limiter-queued">{status.limiter.queued}</div>
              <div className="text-[11px] text-muted-foreground">requests queued across per-location queues</div>
            </div>
            <div className="rounded-xl bg-secondary p-4">
              <div className="text-2xl font-extrabold" data-testid="limiter-429">{status.limiter.rateLimitedEvents}</div>
              <div className="text-[11px] text-muted-foreground">429 events handled with backoff</div>
            </div>
          </div>
        </section>

        {/* Token refresh log */}
        <section className="rounded-3xl border bg-white p-6 shadow-soft">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <RiShieldKeyholeLine className="h-4 w-4 text-primary" /> Token refresh log
          </h2>
          <div className="mt-3 space-y-1.5 font-mono text-[11px]" data-testid="token-log">
            {status.events.length === 0 && <p className="font-sans text-muted-foreground">No token events yet.</p>}
            {status.events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 rounded-lg bg-secondary px-3 py-2">
                <span
                  className={
                    ev.kind === "refresh_error" || ev.kind === "connect_error"
                      ? "font-bold text-red-600"
                      : "font-bold text-emerald-600"
                  }
                >
                  {ev.kind}
                </span>
                <span className="min-w-0 flex-1 break-all text-muted-foreground">{ev.detail}</span>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(ev.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AgencyPage() {
  return (
    <div className="bg-background">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
          </div>
        }
      >
        <AgencySettings />
      </Suspense>
    </div>
  );
}