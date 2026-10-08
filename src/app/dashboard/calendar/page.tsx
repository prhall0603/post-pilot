"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiSend } from "@/lib/apiClient";
import { DashboardShellLoader } from "@/components/app-shell";
import { PlatformBadge } from "@/components/platform-atom";
import { PLATFORM_RULES, isPlatformId, type PlatformId } from "@/lib/platforms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  RiCheckboxCircleLine,
  RiCloseLine,
  RiEditLine,
  RiErrorWarningLine,
  RiImageLine,
  RiPlayLine,
  RiRefreshLine,
  RiSparkling2Line,
  RiTimeLine,
} from "react-icons/ri";

interface PostMediaRef {
  id: string;
  kind: string;
  url?: string | null;
  fileName?: string | null;
  youtubeId?: string | null;
}
interface CalendarPost {
  id: string;
  platform: string;
  scheduledDate: string;
  time: string;
  body: string;
  title?: string | null;
  hashtags?: string | null;
  imagePrompt?: string | null;
  videoScript?: string | null;
  status: string;
  contentTopic: string;
  category: string;
  mediaRequired: boolean;
  ghlAccountId?: string | null;
  failureReason?: string | null;
  failureDetail?: string | null;
  scheduledAttempts: number;
  ghlPostId?: string | null;
  media: PostMediaRef[];
}
interface MediaAsset {
  id: string;
  kind: string;
  fileName?: string | null;
  url?: string | null;
  youtubeId?: string | null;
  mimeType?: string | null;
}

const STATUS_DOT: Record<string, string> = {
  DRAFT: "bg-slate-300",
  APPROVED: "bg-indigo-500",
  SCHEDULED: "bg-emerald-500",
  FAILED: "bg-red-500",
  POSTED: "bg-teal-500",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CalendarData() {
  const router = useRouter();
  const params = useSearchParams();
  const clientId = params.get("client") || "";
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [platformFilter, setPlatformFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [posts, setPosts] = useState<CalendarPost[] | null>(null);
  const [clientName, setClientName] = useState("");
  const [platforms, setPlatforms] = useState<Array<{ platform: string; cadenceWeekly: number }>>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<CalendarPost | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);

  const monthISO = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

  const load = useCallback(async () => {
    if (!clientId) return;
    const q = new URLSearchParams({ year: String(year), month: String(month) });
    if (platformFilter !== "ALL") q.set("platform", platformFilter);
    if (statusFilter !== "ALL") q.set("status", statusFilter);
    const [d, cal, m] = await Promise.all([
      apiGet<{ posts: CalendarPost[] }>(`/api/clients/${clientId}/posts?${q}`),
      apiGet<{ client: { name: string }; platforms: Array<{ platform: string; cadenceWeekly: number }> }>(
        `/api/clients/${clientId}/calendar`
      ),
      apiGet<{ assets: MediaAsset[] }>(`/api/clients/${clientId}/media`),
    ]);
    setPosts(d.posts);
    setClientName(cal.client.name);
    // show only platforms enabled for this client in the filter
    setPlatforms(cal.platforms);
    setAssets(m.assets);
  }, [clientId, year, month, platformFilter, statusFilter]);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load]);

  // ---- calendar grid math (Mon-first) ----
  const grid = useMemo(() => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const startDow = (first.getUTCDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cells: Array<{ date: string | null; day: number | null }> = [];
    for (let i = 0; i < startDow; i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: `${monthISO(year, month)}-${String(d).padStart(2, "0")}`, day: d });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
    return cells;
  }, [year, month]);

  const postsByDate = useMemo(() => {
    const map: Record<string, CalendarPost[]> = {};
    (posts || []).forEach((p) => {
      const d = p.scheduledDate.slice(0, 10);
      (map[d] = map[d] || []).push(p);
    });
    return map;
  }, [posts]);

  const counts = useMemo(() => {
    const c = { total: 0, draft: 0, approved: 0 } as Record<string, number>;
    (posts || []).forEach((p) => {
      c.total++;
      if (p.status === "DRAFT") c.draft++;
      if (p.status === "APPROVED") c.approved++;
    });
    return c;
  }, [posts]);

  // ---- actions ----
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllVisible = () =>
    setSelected(new Set((posts || []).filter((p) => ["DRAFT", "APPROVED"].includes(p.status)).map((p) => p.id)));

  const bulkApprove = async (scope: "all" | "month" | "filtered") => {
    try {
      const body =
        scope === "filtered" && selected.size
          ? { scope: "posts", postIds: [...selected] }
          : scope === "month"
            ? { scope: "month", month: monthISO(year, month) }
            : { scope: "all" };
      const res = await apiSend<{ approved: number }>(`/api/clients/${clientId}/approve`, "POST", body);
      toast.success(`${res.approved} post${res.approved === 1 ? "" : "s"} approved`);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const patch: Record<string, unknown> = { body: editing.body, time: editing.time };
      if (editing.title !== null && editing.title !== undefined) patch.title = editing.title;
      if (editing.hashtags !== null && editing.hashtags !== undefined) patch.hashtags = editing.hashtags;
      await apiSend(`/api/clients/${clientId}/posts/${editing.id}`, "PATCH", patch);
      toast.success("Post updated — approval reset to draft");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const regenerate = async (postId: string) => {
    setRegenerating(postId);
    try {
      await apiSend(`/api/clients/${clientId}/posts/${postId}/regenerate`, "POST", {});
      toast.success("Post regenerated as a draft");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setRegenerating(null);
    }
  };

  const scheduleAll = async () => {
    setScheduling(true);
    try {
      const res = await apiSend<{ scheduled: number; failed: number; skippedWindow: number }>(
        `/api/clients/${clientId}/schedule`,
        "POST",
        {}
      );
      toast.success(
        `Scheduled ${res.scheduled} · failed ${res.failed} · beyond 3-month window ${res.skippedWindow}`
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scheduling failed");
    } finally {
      setScheduling(false);
    }
  };

  const attachMedia = async (post: CalendarPost, assetId: string) => {
    setAttaching(post.id);
    try {
      await apiSend(`/api/clients/${clientId}/posts/${post.id}/media`, "POST", { assetId });
      toast.success("Media attached");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Attach failed");
    } finally {
      setAttaching(null);
    }
  };

  const detachMedia = async (post: CalendarPost, assetId: string) => {
    try {
      await apiSend(`/api/clients/${clientId}/posts/${post.id}/media?assetId=${assetId}`, "DELETE");
      toast.success("Media removed");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Detach failed");
    }
  };

  const prevMonth = () => {
    const d = new Date(Date.UTC(year, month - 2, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
  };
  const nextMonth = () => {
    const d = new Date(Date.UTC(year, month, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
  };

  const canSchedulePost = (p: CalendarPost) =>
    (p.status === "APPROVED" || p.status === "DRAFT") && (!p.mediaRequired || p.media.length > 0);

  if (!clientId) {
    return (
      <div className="rounded-3xl border bg-white p-10 text-center shadow-soft">
        <h2 className="text-lg font-bold">Pick a client to view the calendar</h2>
        <Button asChild className="mt-4 rounded-full shadow-lift">
          <Link href="/dashboard">Go to overview</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Content calendar</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {clientName} · {counts.total} posts in {MONTH_NAMES[month - 1]} {year} · {counts.draft} drafts, {counts.approved} approved
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-full shadow-lift"
            data-testid="approve-month"
            disabled={counts.draft === 0 && counts.approved === 0}
            onClick={() => bulkApprove("month")}
          >
            <RiCheckboxCircleLine className="mr-1.5 h-4 w-4" /> Approve month
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            data-testid="schedule-button"
            disabled={scheduling}
            onClick={scheduleAll}
          >
            <RiPlayLine className="mr-1.5 h-4 w-4" />
            {scheduling ? "Scheduling…" : "Schedule approved to GHL"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 shadow-soft">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth} aria-label="Previous month">
            ‹
          </Button>
          <span className="min-w-36 text-center text-sm font-bold">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth} aria-label="Next month">
            ›
          </Button>
        </div>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-44" data-testid="filter-platform">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All platforms</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p.platform} value={p.platform}>
                {isPlatformId(p.platform) ? PLATFORM_RULES[p.platform as PlatformId].name : p.platform}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="DRAFT">Drafts</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="SCHEDULED">Scheduled</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="POSTED">Posted</SelectItem>
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary">{selected.size} selected</Badge>
            <Button size="sm" className="rounded-full" onClick={() => bulkApprove("filtered")}>
              Approve selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          {(platforms.length ? platforms : []).slice(0, 7).map((p) => (
            <span key={p.platform} className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: isPlatformId(p.platform)
                    ? PLATFORM_RULES[p.platform as PlatformId].accentHex
                    : "#999",
                }}
              />
            </span>
          ))}
          <span>color = platform · dot = status</span>
        </div>
      </div>

      {/* Weekday header */}
      <div className="hidden grid-cols-7 gap-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground sm:grid">
        {DOW.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      {posts === null ? (
        <div className="h-96 animate-pulse rounded-2xl bg-secondary" />
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-7" data-testid="calendar-grid">
          {grid.map((cell, i) => {
            if (!cell.date) return <div key={i} className="min-h-24 sm:visible" />;
            const dayPosts = postsByDate[cell.date] || [];
            const isToday = cell.date === new Date().toISOString().slice(0, 10);
            return (
              <div
                key={i}
                className={`min-h-24 rounded-xl border bg-white p-1.5 ${isToday ? "border-primary/60 ring-1 ring-primary/30" : ""}`}
                data-testid={`day-${cell.date}`}
              >
                <div className="mb-1 text-[10px] font-bold text-muted-foreground">{cell.day}</div>
                <div className="space-y-1">
                  {dayPosts.slice(0, 3).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setEditing(p)}
                      data-testid={`post-${p.id}`}
                      className="block w-full rounded-lg border-l-3 bg-secondary/70 p-1.5 text-left transition hover:bg-secondary"
                      style={{ borderLeftColor: isPlatformId(p.platform) ? PLATFORM_RULES[p.platform as PlatformId].accentHex : "#999" }}
                    >
                      <span className="flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[p.status] || "bg-slate-300"}`} />
                        <span className="truncate text-[10px] font-semibold">{p.contentTopic}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[9px] text-muted-foreground">
                        <RiTimeLine className="h-2 w-2" />
                        {p.time}
                        {p.mediaRequired && !p.media.length && (
                          <RiImageLine className="h-2.5 w-2.5 text-amber-600" title="Media required" />
                        )}
                      </span>
                    </button>
                  ))}
                  {dayPosts.length > 3 && (
                    <div className="text-[9px] font-medium text-muted-foreground">
                      +{dayPosts.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk selection bar (mobile) */}
      {selected.size > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-2xl bg-[hsl(var(--sidebar-background))] p-3 text-white shadow-lift lg:hidden">
          <span className="text-sm font-semibold">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" className="rounded-full" onClick={() => bulkApprove("filtered")}>
              Approve
            </Button>
            <Button size="sm" variant="ghost" className="text-white" onClick={() => setSelected(new Set())}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Post editor dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="post-editor">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2.5">
                  <PlatformBadge platform={editing.platform} />
                  <span className="truncate">{editing.contentTopic}</span>
                  <Badge
                    variant="outline"
                    className={editing.status === "FAILED" ? "border-red-200 bg-red-50 text-red-700" : ""}
                  >
                    {editing.status.toLowerCase()}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {editing.status === "FAILED" && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    <div className="flex items-center gap-1.5 font-bold">
                      <RiErrorWarningLine className="h-3.5 w-3.5" />
                      {editing.failureReason}
                    </div>
                    <div className="mt-1">{editing.failureDetail}</div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{editing.scheduledDate?.slice(0, 10)}</span>
                  <Input
                    type="time"
                    className="w-28"
                    value={editing.time}
                    onChange={(e) => setEditing({ ...editing, time: e.target.value })}
                  />
                  {isPlatformId(editing.platform) && (
                    <Badge variant="outline" className="border bg-white">
                      max {PLATFORM_RULES[editing.platform as PlatformId].maxLen.toLocaleString()} chars
                      {editing.body.length > PLATFORM_RULES[editing.platform as PlatformId].maxLen
                        ? ` · over by ${editing.body.length - PLATFORM_RULES[editing.platform as PlatformId].maxLen}`
                        : ""}
                    </Badge>
                  )}
                  <Checkbox
                    id="select-post"
                    checked={selected.has(editing.id)}
                    onCheckedChange={() => toggle(editing.id)}
                  />
                  <Label htmlFor="select-post" className="text-xs font-normal">select</Label>
                </div>

                {editing.platform === "youtube" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Video title</Label>
                    <Input
                      value={editing.title || ""}
                      onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      data-testid="post-title-input"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Body {editing.mediaRequired && !editing.media.length && (
                    <span className="ml-1 text-amber-600">· media required before scheduling</span>
                  )}</Label>
                  <Textarea
                    data-testid="post-body-input"
                    rows={8}
                    value={editing.body}
                    onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  />
                </div>

                {editing.platform !== "youtube" && editing.platform !== "gbp" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hashtags</Label>
                    <Input
                      value={editing.hashtags || ""}
                      onChange={(e) => setEditing({ ...editing, hashtags: e.target.value })}
                    />
                  </div>
                )}

                {(editing.imagePrompt || editing.videoScript) && (
                  <div className="space-y-2 rounded-xl bg-secondary p-3">
                    {editing.imagePrompt && (
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          Image prompt
                        </div>
                        <p className="mt-1 text-xs">{editing.imagePrompt}</p>
                      </div>
                    )}
                    {editing.videoScript && (
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          Video script / shot list
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs">{editing.videoScript}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Media attach */}
                <div className="rounded-xl border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold">Attached media</span>
                    <span className="text-[10px] text-muted-foreground">
                      {editing.mediaRequired ? "required for this platform" : "optional"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editing.media.map((m) => (
                      <div key={m.id} className="group relative flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 text-[11px]">
                        {m.kind === "youtube" ? "▶ YouTube" : m.kind}
                        <span className="max-w-24 truncate text-muted-foreground">{m.fileName}</span>
                        <button
                          onClick={() => detachMedia(editing, m.id)}
                          className="text-muted-foreground transition hover:text-red-600"
                        >
                          <RiCloseLine className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {!editing.media.length && (
                      <span className="text-[11px] text-muted-foreground">Nothing attached yet.</span>
                    )}
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] font-semibold text-primary">
                      Attach from media library
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {assets
                        .filter((a) => {
                          if (!isPlatformId(editing.platform)) return true;
                          const kinds = PLATFORM_RULES[editing.platform as PlatformId].mediaKinds;
                          return a.kind === "youtube" ? kinds.includes("video") : kinds.includes(a.kind as "image" | "video");
                        })
                        .map((a) => (
                          <button
                            key={a.id}
                            disabled={attaching === editing.id}
                            onClick={() => attachMedia(editing, a.id)}
                            className="flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 text-[11px] transition hover:border-primary hover:bg-primary/5"
                          >
                            {a.kind === "youtube" ? "▶" : a.kind === "video" ? "🎬" : "🖼"} {a.fileName}
                          </button>
                        ))}
                      {!assets.length && (
                        <span className="text-[11px] text-muted-foreground">
                          Library is empty — upload in the{" "}
                          <Link className="text-primary underline" href={`/dashboard/media?client=${clientId}`}>
                            media library
                          </Link>
                          .
                        </span>
                      )}
                    </div>
                  </details>
                </div>
              </div>

              <DialogFooter className="flex-wrap gap-2">
                <Button
                  variant="ghost"
                  className="rounded-full"
                  disabled={regenerating === editing.id}
                  onClick={() => regenerate(editing.id)}
                  data-testid="regenerate-post"
                >
                  <RiRefreshLine className="mr-1.5 h-3.5 w-3.5" />
                  {regenerating === editing.id ? "Regenerating…" : "AI regenerate"}
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={async () => {
                    await apiSend(`/api/clients/${clientId}/approve`, "POST", {
                      scope: "posts",
                      postIds: [editing.id],
                    });
                    toast.success("Post approved");
                    setEditing(null);
                    load();
                  }}
                >
                  <RiCheckboxCircleLine className="mr-1.5 h-3.5 w-3.5" /> Approve
                </Button>
                <Button className="rounded-full shadow-lift" onClick={saveEdit} data-testid="save-post">
                  Save
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <DashboardShellLoader>
      <CalendarData />
    </DashboardShellLoader>
  );
}