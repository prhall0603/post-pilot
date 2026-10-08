"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/lib/apiClient";
import { DashboardShellLoader } from "@/components/app-shell";
import { PlatformBadge } from "@/components/platform-atom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  RiAddLine,
  RiMoreLine,
  RiRocketLine,
  RiDeleteBinLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiTimerFlashLine,
  RiImageLine,
} from "react-icons/ri";

interface ClientRow {
  id: string;
  name: string;
  industry: string;
  website?: string | null;
  locationId?: string | null;
  planStatus: string;
  platforms: Array<{ platform: string; cadenceWeekly: number }>;
  postCounts: { draft: number; approved: number; scheduled: number; failed: number; posted: number };
  totalPosts: number;
  aiCostEstimated: number;
  health: string;
  missingMedia: number;
}

const HEALTH: Record<string, { label: string; className: string }> = {
  "needs-attention": { label: "Needs attention", className: "bg-red-50 text-red-700 border-red-200" },
  "on-track": { label: "On track", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "ready-to-schedule": { label: "Ready to schedule", className: "bg-amber-50 text-amber-700 border-amber-200" },
  "awaiting-approval": { label: "Awaiting approval", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "not-generated": { label: "Plan not generated", className: "bg-secondary text-secondary-foreground border" },
};

const PLAN_LABEL: Record<string, string> = {
  NOT_GENERATED: "Not generated",
  GENERATING: "Generating…",
  GENERATED: "Plan ready",
};

function ClientsData() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);

  const load = () => apiGet<{ clients: ClientRow[] }>("/api/clients").then((d) => setClients(d.clients));

  useEffect(() => {
    load().catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load clients"));
  }, []);

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" and its entire content plan?`)) return;
    try {
      await apiSend(`/api/clients/${id}`, "DELETE");
      toast.success(`${name} deleted`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every client links to one GHL sub-account and carries its own year-long plan.
          </p>
        </div>
        <Button asChild className="rounded-full shadow-lift" data-testid="new-client">
          <Link href="/clients/new">
            <RiAddLine className="mr-1.5 h-4 w-4" /> New client
          </Link>
        </Button>
      </div>

      {clients === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-secondary" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-3xl border bg-white p-10 text-center shadow-soft">
          <img src="/launch-complete.svg" alt="" className="mx-auto w-64" />
          <h2 className="mt-4 text-lg font-bold">No clients yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Onboard your first client to generate a year of content and start scheduling through GHL.
          </p>
          <Button asChild className="mt-5 rounded-full shadow-lift">
            <Link href="/clients/new">
              <RiAddLine className="mr-1.5 h-4 w-4" /> Onboard a client
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => {
            const health = HEALTH[c.health] || HEALTH["not-generated"];
            return (
              <div
                key={c.id}
                className="flex flex-col rounded-2xl border bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard?client=${c.id}`}
                      className="truncate text-base font-bold transition hover:text-primary"
                    >
                      {c.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{c.industry}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <RiMoreLine className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/settings?client=${c.id}`}>Settings</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => remove(c.id, c.name)}
                      >
                        <RiDeleteBinLine className="h-4 w-4" /> Delete client
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.platforms.map((p) => (
                    <PlatformBadge key={p.platform} platform={p.platform} size="sm" />
                  ))}
                  {!c.platforms.length && (
                    <span className="text-xs text-muted-foreground">No platforms configured</span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Drafts", c.postCounts.draft],
                    ["Approved", c.postCounts.approved],
                    ["Scheduled", c.postCounts.scheduled],
                  ].map(([label, n], i) => (
                    <div key={i} className="rounded-xl bg-secondary px-2 py-2">
                      <div className="text-base font-extrabold">{n}</div>
                      <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={health.className}>
                    {c.postCounts.failed > 0 && <RiErrorWarningLine className="mr-1 h-3 w-3" />}
                    {health.label}
                  </Badge>
                  <Badge variant="outline" className="border bg-white">
                    <RiRocketLine className="mr-1 h-3 w-3 text-primary" />
                    {PLAN_LABEL[c.planStatus] || c.planStatus}
                  </Badge>
                  {c.missingMedia > 0 && (
                    <Badge variant="outline" className="border bg-white">
                      <RiImageLine className="mr-1 h-3 w-3 text-amber-600" />
                      {c.missingMedia} need media
                    </Badge>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="font-mono">{c.locationId ? `GHL · ${c.locationId.slice(0, 16)}` : "No sub-account"}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <RiTimerFlashLine className="h-3 w-3" />${c.aiCostEstimated.toFixed(2)} est. AI cost
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ClientsPage() {
  return (
    <DashboardShellLoader>
      <ClientsData />
    </DashboardShellLoader>
  );
}