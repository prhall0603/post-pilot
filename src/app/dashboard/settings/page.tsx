"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiGet, apiSend } from "@/lib/apiClient";
import { DashboardShellLoader } from "@/components/app-shell";
import { PlatformBadge } from "@/components/platform-atom";
import { PLATFORMS, PLATFORM_RULES, isPlatformId, type PlatformId } from "@/lib/platforms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  RiSparkling2Line,
  RiRefreshLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiImageLine,
} from "react-icons/ri";

interface ClientFull {
  id: string;
  name: string;
  industry: string;
  website?: string | null;
  locationId?: string | null;
  brandVoice: string;
  brandVoiceNotes?: string | null;
  targetAudience?: string | null;
  serviceArea?: string | null;
  logoUrl?: string | null;
  planStatus: string;
  generatedUntil?: string | null;
  aiCostEstimated: number;
  aiTokensEstimated: number;
  platforms: Array<{ platform: string; cadenceWeekly: number }>;
  products: Array<{ id: string; name: string; description: string }>;
  blackoutDates: Array<{ id: string; date: string; reason: string }>;
  platformAccounts: Array<{ id: string; platform: string; accountName: string; ghlAccountId: string }>;
  scheduledRuns: Array<{ id: string; status: string; scheduled: number; failed: number; createdAt: string; detail?: string | null }>;
}
interface GhlStatus {
  connected: boolean;
  mode?: "DEMO" | "LIVE" | null;
  configured: boolean;
  aiMode?: "ai" | "demo";
}
interface Location {
  id: string;
  name: string;
}
interface Account {
  id: string;
  name: string;
  platform: string;
}

function SettingsData() {
  const params = useSearchParams();
  const clientId = params.get("client") || "";
  const [client, setClient] = useState<ClientFull | null>(null);
  const [ghl, setGhl] = useState<GhlStatus | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [cadence, setCadence] = useState<Record<string, number>>({});
  const [platformEnabled, setPlatformEnabled] = useState<Record<string, boolean>>({});
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!clientId) return;
    const [c, g, locs] = await Promise.all([
      apiGet<{ client: ClientFull }>(`/api/clients/${clientId}`),
      apiGet<GhlStatus>("/api/ghl/status"),
      apiGet<{ locations: Location[] }>("/api/ghl/locations").catch(() => ({ locations: [] as Location[] })),
    ]);
    setClient(c.client);
    setGhl(g);
    setLocations(locs.locations);
    setForm({
      name: c.client.name,
      industry: c.client.industry,
      website: c.client.website || "",
      locationId: c.client.locationId || "",
      brandVoice: c.client.brandVoice,
      brandVoiceNotes: c.client.brandVoiceNotes || "",
      targetAudience: c.client.targetAudience || "",
      serviceArea: c.client.serviceArea || "",
    });
    setCadence(Object.fromEntries(c.client.platforms.map((p) => [p.platform, p.cadenceWeekly])));
    setPlatformEnabled(
      Object.fromEntries(PLATFORMS.map((p) => [p, c.client.platforms.some((x) => x.platform === p)]))
    );
    const accsByPlatform: Record<string, string> = {};
    for (const pa of c.client.platformAccounts) accsByPlatform[pa.platform] = pa.ghlAccountId;
    setAssignments(accsByPlatform);
    if (c.client.locationId) {
      apiGet<{ accounts: Account[] }>(`/api/ghl/accounts?locationId=${c.client.locationId}`)
        .then((d) => setAccounts(d.accounts))
        .catch(() => setAccounts([]));
    }
  }, [clientId]);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiSend(`/api/clients/${clientId}`, "PATCH", form);
      toast.success("Client profile saved");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const enabled = useMemo(() => PLATFORMS.filter((p) => platformEnabled[p]), [platformEnabled]);

  const savePlatforms = async (regenerateRemaining: boolean) => {
    if (!enabled.length) {
      toast.error("Select at least one platform");
      return;
    }
    setRegenerating(true);
    try {
      await apiSend(`/api/clients/${clientId}/platforms`, "PUT", {
        platforms: enabled.map((p) => ({ platform: p, cadenceWeekly: cadence[p] ?? 3 })),
        regenerateRemaining,
      });
      toast.success(
        regenerateRemaining ? "Cadences saved — remaining posts regenerated" : "Cadences saved"
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setRegenerating(false);
    }
  };

  const syncAccounts = async () => {
    if (!client?.locationId) return;
    setSyncing(true);
    try {
      const d = await apiGet<{ accounts: Account[] }>(`/api/ghl/accounts?locationId=${client.locationId}`);
      setAccounts(d.accounts);
      toast.success(`${d.accounts.length} connected accounts synced from GHL`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const saveAssignments = async () => {
    if (!client) return;
    setAssigning(true);
    try {
      await apiSend("/api/ghl/accounts", "POST", {
        clientId: client.id,
        locationId: client.locationId,
        assignments: Object.entries(assignments)
          .filter(([, id]) => id)
          .map(([platform, ghlAccountId]) => ({
            platform,
            ghlAccountId,
            accountName: accounts.find((a) => a.id === ghlAccountId)?.name || ghlAccountId,
          })),
      });
      toast.success("Platform account assignments saved");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setAssigning(false);
    }
  };

  const uploadLogo = async (file: File) => {
    try {
      await apiSend(`/api/clients/${clientId}`, "PATCH", {}).catch(() => {});
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/upload/logo?clientId=${clientId}`, { method: "POST", body: fd });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Upload failed");
      }
      toast.success("Logo updated");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  if (!clientId) {
    return (
      <div className="rounded-3xl border bg-white p-10 text-center shadow-soft">
        <h2 className="text-lg font-bold">Pick a client to manage settings</h2>
        <Button asChild className="mt-4 rounded-full shadow-lift">
          <Link href="/dashboard">Go to overview</Link>
        </Button>
      </div>
    );
  }
  if (!client) {
    return <div className="h-64 animate-pulse rounded-3xl bg-secondary" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Client settings</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{client.name}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-xs font-semibold">
          AI estimate
          <span className="text-primary">${client.aiCostEstimated.toFixed(2)}</span>
          <span className="font-normal text-muted-foreground">
            · {client.aiTokensEstimated.toLocaleString()} tokens
          </span>
        </div>
      </div>

      {/* Brand + profile */}
      <section className="rounded-3xl border bg-white p-6 shadow-soft">
        <h2 className="mb-4 text-sm font-bold">Brand &amp; company</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Company name</Label>
            <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Industry</Label>
            <Input value={form.industry || ""} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Website</Label>
            <Input value={form.website || ""} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">GHL sub-account</Label>
            <Select
              value={form.locationId || "none"}
              onValueChange={(v) => setForm({ ...form, locationId: v === "none" ? "" : v })}
            >
              <SelectTrigger data-testid="settings-location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} ({l.id.slice(0, 14)}…)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Brand voice</Label>
            <Select value={form.brandVoice || "professional"} onValueChange={(v) => setForm({ ...form, brandVoice: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
                <SelectItem value="educational">Educational</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Target audience</Label>
            <Input value={form.targetAudience || ""} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Geographic service area</Label>
            <Input value={form.serviceArea || ""} onChange={(e) => setForm({ ...form, serviceArea: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Style notes</Label>
            <Textarea rows={2} value={form.brandVoiceNotes || ""} onChange={(e) => setForm({ ...form, brandVoiceNotes: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Logo</Label>
            <div className="flex items-center gap-3">
              {client.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={client.logoUrl} alt="logo" className="h-10 w-10 rounded-xl object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                  <RiImageLine className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <label className="cursor-pointer text-xs font-semibold text-primary hover:underline">
                Replace logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
                />
              </label>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button className="rounded-full" disabled={saving} onClick={saveProfile}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </section>

      {/* GHL connection */}
      <section className="rounded-3xl border bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold">GHL connection</h2>
          {ghl && (
            <Badge
              variant="outline"
              className={
                ghl.mode === "LIVE"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }
              data-testid="ghl-mode-badge"
            >
              {ghl.mode === "LIVE" ? "Live — real GHL" : ghl.mode === "DEMO" ? "Demo Mode — simulated" : "Not connected"}
            </Badge>
          )}
        </div>
        <div className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
          <div className="rounded-xl bg-secondary p-3">
            <div className="font-semibold text-foreground">Sub-account</div>
            <div className="mt-1 font-mono text-[11px]">{client.locationId || "not linked"}</div>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <div className="font-semibold text-foreground">Connected accounts</div>
            <div className="mt-1">{accounts.length} platform accounts on this location</div>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <div className="font-semibold text-foreground">Plan coverage</div>
            <div className="mt-1">
              {client.generatedUntil ? `generated through ${client.generatedUntil.slice(0, 7)}` : "no plan yet"}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Manage the GHL app connection, token health, and rate limits in{" "}
          <Link href="/settings/agency" className="text-primary underline">
            agency settings
          </Link>
          .
        </p>
      </section>

      {/* Platform connected accounts */}
      <section className="rounded-3xl border bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">Platform target accounts</h2>
            <p className="text-[11px] text-muted-foreground">
              Which connected account each platform posts through (from GHL Social Planner on this location).
            </p>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" disabled={syncing || !client.locationId} onClick={syncAccounts}>
            <RiRefreshLine className={`mr-1 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync from GHL"}
          </Button>
        </div>
        <div className="mt-4 space-y-2.5">
          {PLATFORMS.filter((p) => platformEnabled[p]).map((p) => {
            const opts = accounts.filter((a) => a.platform === p);
            return (
              <div key={p} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                <PlatformBadge platform={p} size="sm" />
                <div className="min-w-0 flex-1 text-xs font-semibold">
                  {isPlatformId(p) ? PLATFORM_RULES[p as PlatformId].name : p}
                </div>
                <Select
                  value={assignments[p] || "none"}
                  onValueChange={(v) => setAssignments({ ...assignments, [p]: v === "none" ? "" : v })}
                >
                  <SelectTrigger className="w-56" data-testid={`account-assign-${p}`}>
                    <SelectValue placeholder="Assign account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not assigned</SelectItem>
                    {opts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <Button className="rounded-full" disabled={assigning} onClick={saveAssignments}>
            {assigning ? "Saving…" : "Save assignments"}
          </Button>
        </div>
      </section>

      {/* Cadence */}
      <section className="rounded-3xl border bg-white p-6 shadow-soft">
        <h2 className="text-sm font-bold">Platforms &amp; cadence</h2>
        <p className="text-[11px] text-muted-foreground">
          Changing cadence affects new generations. "Regenerate remaining" deletes unscheduled drafts/approved
          posts from today onward and rebuilds the remaining months with the new mix.
        </p>
        <div className="mt-4 space-y-2.5">
          {PLATFORMS.map((p) => {
            const rules = isPlatformId(p) ? PLATFORM_RULES[p as PlatformId] : null;
            const assigned = assignments[p];
            return (
              <div key={p} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                <Switch
                  checked={Boolean(platformEnabled[p])}
                  onCheckedChange={(v) => setPlatformEnabled({ ...platformEnabled, [p]: v })}
                />
                <PlatformBadge platform={p} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold">{rules?.name || p}</div>
                  <div className="text-[10px] text-muted-foreground">{rules?.maxLen.toLocaleString()} char max</div>
                </div>
                {platformEnabled[p] && (
                  <div className="flex items-center gap-2">
                    <Slider className="w-24" min={1} max={7} step={1} value={[cadence[p] ?? 3]} onValueChange={(v) => setCadence({ ...cadence, [p]: v[0] })} />
                    <Badge variant="secondary">{cadence[p] ?? 3}/wk</Badge>
                    {ghl?.mode === "LIVE" && assigned && (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
                        <RiCheckboxCircleLine className="mr-1 h-3 w-3" /> GHL live
                      </Badge>
                    )}
                    {ghl?.mode === "LIVE" && !assigned && (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                        <RiCloseCircleLine className="mr-1 h-3 w-3" /> assign in GHL
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => savePlatforms(false)} disabled={regenerating}>
            Save cadences
          </Button>
          <Button
            className="rounded-full shadow-lift"
            data-testid="regenerate-remaining"
            onClick={() => savePlatforms(true)}
            disabled={regenerating}
          >
            <RiSparkling2Line className="mr-1.5 h-4 w-4" />
            {regenerating ? "Regenerating…" : "Save + regenerate remaining unscheduled"}
          </Button>
        </div>
      </section>

      {/* Scheduling runs */}
      <section className="rounded-3xl border bg-white p-6 shadow-soft">
        <h2 className="text-sm font-bold">Recent scheduling runs</h2>
        <div className="mt-3 space-y-2 text-xs">
          {client.scheduledRuns.length === 0 && <p className="text-muted-foreground">No scheduling runs yet.</p>}
          {client.scheduledRuns.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
              <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
              <span className="font-semibold">
                {r.scheduled} scheduled · {r.failed} failed
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function ClientSettingsPage() {
  return (
    <DashboardShellLoader>
      <SettingsData />
    </DashboardShellLoader>
  );
}