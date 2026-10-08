"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiSend } from "@/lib/apiClient";
import { DashboardShellLoader } from "@/components/app-shell";
import { PlatformBadge } from "@/components/platform-atom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  RiFileList2Line,
  RiErrorWarningLine,
  RiPlayLine,
  RiSparkling2Line,
  RiRefreshLine,
} from "react-icons/ri";
import { PLATFORM_RULES, isPlatformId, type PlatformId } from "@/lib/platforms";

interface OverviewClient {
  id: string;
  name: string;
  industry: string;
  planStatus: string;
  generatedUntil?: string | null;
  aiCostEstimated: number;
  aiTokensEstimated: number;
  locationId?: string | null;
  schedulingCursor?: string | null;
}
interface PlatformRow {
  platform: string;
  cadenceWeekly: number;
}
interface AccountRow {
  id: string;
  platform: string;
  accountName: string;
  ghlAccountId: string;
}
interface Counts {
  byMonth: Record<string, number>;
  byPlatform: Record<string, number>;
  byStatus: Record<string, number>;
  total: number;
}
interface FailedPost {
  id: string;
  platform: string;
  scheduledDate: string;
  contentTopic: string;
  failureReason?: string | null;
  failureDetail?: string | null;
  scheduledAttempts: number;
}

function DashboardData() {
  const params = useSearchParams();
  const [data, setData] = useState<{
    client: OverviewClient;
    platforms: PlatformRow[];
    platformAccounts: AccountRow[];
    counts: Counts;
  } | null>(null);
  const [failed, setFailed] = useState<FailedPost[]>([]);
  const [genState, setGenState] = useState<{ running: boolean; label: string; current: number; total: number }>({
    running: false,
    label: "",
    current: 0,
    total: 0,
  });
  const [retrying, setRetrying] = useState<string | null>(null);

  const clientId = params.get("client") || "";

  const load = useCallback(async (id: string) => {
    const [d, f] = await Promise.all([
      apiGet<{ client: OverviewClient; platforms: PlatformRow[]; platformAccounts: AccountRow[]; counts: Counts }>(
        `/api/clients/${id}/calendar`
      ),
      apiGet<{ posts: FailedPost[] }>(`/api/clients/${id}/posts?status=FAILED`),
    ]);
    setData(d);
    setFailed(f.posts);
  }, []);

  const startGeneration = useCallback(
    async (id: string) => {
      setGenState({ running: true, label: "Starting…", current: 0, total: 12 });
      try {
        await apiSend(`/api/clients/${id}/generate`, "POST", {});
        for (let step = 1; step <= 12; step++) {
          const r = await apiSend<{ ok: boolean; monthLabel: string; error?: string }>(
            `/api/clients/${id}/generate/step`,
            "POST"
          );
          if (!r.ok) {
            toast.error(`Batch failed for ${r.monthLabel}: ${r.error || "unknown error"}`);
            break;
          }
          setGenState({ running: true, label: `Generating ${r.monthLabel}`, current: step, total: 12 });
          load(id).catch(() => {});
        }
        toast.success("12-month plan generated");
        load(id).catch(() => {});
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Generation failed");
      } finally {
        setGenState({ running: false, label: "", current: 0, total: 0 });
      }
    },
    [load]
  );

  useEffect(() => {
    if (!clientId) return;
    load(clientId).catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"));
    if (params.get("generate") === "1") {
      startGeneration(clientId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const retryFailed = async (postId: string) => {
    if (!clientId) return;
    setRetrying(postId);
    try {
      const res = await apiSend<{ scheduled: number; failed: number }>(
        `/api/clients/${clientId}/schedule`,
        "POST",
        { postIds: [postId] }
      );
      if (res.scheduled > 0) toast.success("Post scheduled to GHL");
      else toast.error("Still failing — check the reason in the tray");
      load(clientId).catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetrying(null);
    }
  };

  if (!clientId) {
    return (
      <div className="rounded-3xl border bg-white p-10 text-center shadow-soft">
        <h2 className="text-lg font-bold">Pick a client to begin</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use the client switcher in the sidebar.</p>
        <Button asChild className="mt-5 rounded-full shadow-lift">
          <Link href="/clients/new">Onboard a client</Link>
        </Button>
      </div>
    );
  }
  if (!data) {
    return <div className="h-64 animate-pulse rounded-3xl bg-secondary" />;
  }

  const c = data.client;
  const statusOrder = ["DRAFT", "APPROVED", "SCHEDULED", "FAILED", "POSTED"] as const;
  const statusLabels: Record<string, string> = {
    DRAFT: "Drafts",
    APPROVED: "Approved",
    SCHEDULED: "Scheduled",
    FAILED: "Failed",
    POSTED: "Posted",
  };
  const statusColors: Record<string, string> = {
    DRAFT: "bg-secondary text-secondary-foreground",
    APPROVED: "bg-indigo-50 text-indigo-700",
    SCHEDULED: "bg-emerald-50 text-emerald-700",
    FAILED: "bg-red-50 text-red-700",
    POSTED: "bg-teal-50 text-teal-700",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" data-testid="client-overview-name">{c.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{c.industry}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.planStatus !== "GENERATED" && c.planStatus !== "GENERATING" ? (
            <Button
              className="rounded-full shadow-lift"
              data-testid="generate-plan"
              disabled={genState.running}
              onClick={() => startGeneration(clientId)}
            >
              <RiSparkling2Line className="mr-1.5 h-4 w-4" /> Generate 12-month plan
            </Button>
          ) : (
            <Button variant="outline" className="rounded-full" disabled={genState.running} onClick={() => startGeneration(clientId)}>
              <RiRefreshLine className="mr-1.5 h-4 w-4" /> Regenerate remaining
            </Button>
          )}
          <Button asChild variant="outline" className="rounded-full">
            <Link href={`/dashboard/calendar?client=${c.id}`}>Open calendar</Link>
          </Button>
        </div>
      </div>

      {/* Generation progress */}
      {genState.running && (
        <div className="rounded-2xl border bg-white p-5 shadow-soft" data-testid="generation-progress">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span className="flex items-center gap-2">
              <RiSparkling2Line className="h-4 w-4 text-primary" />
              {genState.label}…
            </span>
            <span className="text-muted-foreground">
              {genState.current}/{genState.total}
            </span>
          </div>
          <Progress value={(genState.current / genState.total) * 100} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            Each month saves on completion — reloading never loses progress.
          </p>
        </div>
      )}

      {/* Needs-attention tray */}
      {failed.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5" data-testid="needs-attention">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-red-800">
            <RiErrorWarningLine className="h-4 w-4" /> Needs attention — {failed.length} failed
            {failed.length === 1 ? " post" : " posts"}
          </h3>
          <div className="space-y-2.5">
            {failed.map((f) => (
              <div
                key={f.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-white p-3"
              >
                <PlatformBadge platform={f.platform} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{f.contentTopic}</div>
                  <div className="truncate text-xs text-red-700">
                    {f.failureReason}: {f.failureDetail}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={retrying === f.id}
                  onClick={() => retryFailed(f.id)}
                  data-testid={`retry-${f.id}`}
                >
                  <RiPlayLine className="mr-1 h-3.5 w-3.5" />
                  {retrying === f.id ? "Retrying…" : "Retry"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {statusOrder.map((s) => (
          <div key={s} className="rounded-2xl border bg-white p-4 text-center shadow-soft">
            <div className="text-2xl font-extrabold" data-testid={`count-${s.toLowerCase()}`}>
              {data.counts.byStatus[s] || 0}
            </div>
            <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColors[s]}`}>
              {statusLabels[s]}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* By month */}
        <div className="rounded-2xl border bg-white p-5 shadow-soft lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
            <RiFileList2Line className="h-4 w-4 text-primary" /> Posts by month
          </h3>
          {Object.keys(data.counts.byMonth).length === 0 ? (
            <p className="text-sm text-muted-foreground">No posts yet — generate the 12-month plan above.</p>
          ) : (
            <div className="flex h-40 items-end gap-1.5">
              {Object.entries(data.counts.byMonth)
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(0, 12)
                .map(([m, n]) => {
                  const max = Math.max(...Object.values(data.counts.byMonth), 1);
                  return (
                    <div key={m} className="flex flex-1 flex-col items-center gap-1">
                      <div className="text-[9px] font-semibold text-muted-foreground">{n}</div>
                      <div
                        className="w-full rounded-t-md bg-primary/80"
                        style={{ height: `${Math.max(6, (n / max) * 100)}%` }}
                      />
                      <div className="text-[9px] text-muted-foreground">{m.slice(5)}/{m.slice(2, 4)}</div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Platforms & accounts */}
        <div className="rounded-2xl border bg-white p-5 shadow-soft">
          <h3 className="mb-4 text-sm font-bold">Platforms &amp; connected accounts</h3>
          <div className="space-y-2.5">
            {data.platforms.map((p) => {
              const rules = isPlatformId(p.platform) ? PLATFORM_RULES[p.platform as PlatformId] : null;
              const accounts = data.platformAccounts.filter((a) => a.platform === p.platform);
              return (
                <div key={p.platform} className="flex items-center gap-2.5">
                  <PlatformBadge platform={p.platform} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{rules?.name || p.platform}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {accounts.length ? accounts[0].accountName : "not assigned"}
                      {" · "}
                      {p.cadenceWeekly}/week
                    </div>
                  </div>
                  <span className="text-xs font-bold">{data.counts.byPlatform[p.platform] || 0}</span>
                </div>
              );
            })}
            {data.platforms.length === 0 && (
              <p className="text-sm text-muted-foreground">No platforms — set them in client settings.</p>
            )}
          </div>
          <div className="mt-4 rounded-xl bg-secondary p-3 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>AI cost estimate</span>
              <span className="font-bold text-foreground">${c.aiCostEstimated.toFixed(2)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span>Tokens</span>
              <span>{c.aiTokensEstimated.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <DashboardShellLoader>
      <DashboardData />
    </DashboardShellLoader>
  );
}