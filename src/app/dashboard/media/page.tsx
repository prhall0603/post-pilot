"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiGet, apiSend, apiUpload } from "@/lib/apiClient";
import { DashboardShellLoader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  RiDeleteBinLine,
  RiImageLine,
  RiUploadCloudLine,
  RiYoutubeLine,
  RiCloudLine,
  RiVideoLine,
} from "react-icons/ri";

interface MediaAsset {
  id: string;
  kind: string; // image | video | youtube
  fileName?: string | null;
  url?: string | null;
  ghlUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  youtubeId?: string | null;
  createdAt: string;
}

function MediaData() {
  const params = useSearchParams();
  const clientId = params.get("client") || "";
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [pushing, setPushing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    const d = await apiGet<{ assets: MediaAsset[] }>(`/api/clients/${clientId}/media`);
    setAssets(d.assets);
  }, [clientId]);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files || !clientId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await apiUpload(`/api/clients/${clientId}/media`, file);
      }
      toast.success("Uploaded");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const addYoutube = async () => {
    if (!ytUrl.trim() || !clientId) return;
    try {
      await apiSend(`/api/clients/${clientId}/media`, "POST", { youtubeUrl: ytUrl });
      setYtUrl("");
      toast.success("YouTube video linked");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to link");
    }
  };

  const pushToGhl = async (asset: MediaAsset) => {
    if (!clientId) return;
    setPushing(asset.id);
    try {
      await apiSend(`/api/clients/${clientId}/media`, "PATCH", { assetId: asset.id });
      toast.success("Uploaded to GHL CDN — ready for scheduling");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "GHL upload failed");
    } finally {
      setPushing(null);
    }
  };

  const remove = async (asset: MediaAsset) => {
    if (!confirm(`Delete "${asset.fileName || "asset"}"? It detaches from any posts.`)) return;
    try {
      await apiSend(`/api/clients/${clientId}/media?assetId=${asset.id}`, "DELETE");
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const kindIcon = (kind: string) =>
    kind === "youtube" ? <RiYoutubeLine className="h-4 w-4 text-red-600" /> : kind === "video" ? <RiVideoLine className="h-4 w-4 text-violet-600" /> : <RiImageLine className="h-4 w-4 text-sky-600" />;

  if (!clientId) {
    return (
      <div className="rounded-3xl border bg-white p-10 text-center shadow-soft">
        <h2 className="text-lg font-bold">Pick a client to manage media</h2>
        <Button asChild className="mt-4 rounded-full shadow-lift">
          <Link href="/dashboard">Go to overview</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Media library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Images and videos for this client. Attach them to posts on the calendar; scheduling uploads to the GHL
          CDN automatically.
        </p>
      </div>

      {/* Upload row */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed bg-white p-5 transition hover:border-primary/50 hover:bg-primary/5">
          <RiUploadCloudLine className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-bold">Upload image or video</div>
            <div className="text-xs text-muted-foreground">Images up to 10MB · videos up to 100MB</div>
          </div>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => upload(e.target.files)}
          />
        </label>
        <div className="flex items-center gap-3 rounded-2xl border bg-white p-5">
          <RiYoutubeLine className="h-6 w-6 text-red-600" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="text-sm font-bold">Link a YouTube video</div>
            <div className="flex gap-2">
              <Input
                placeholder="https://youtube.com/watch?v=…"
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
              />
              <Button variant="outline" className="rounded-full" onClick={addYoutube}>
                Link
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      {assets === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-secondary" />
      ) : assets.length === 0 ? (
        <div className="rounded-3xl border bg-white p-10 text-center shadow-soft">
          <RiImageLine className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h2 className="mt-3 text-lg font-bold">No media yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Instagram, TikTok, and YouTube posts can't schedule without media. Upload here and it stays reusable
            across posts.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((a) => (
            <div key={a.id} className="overflow-hidden rounded-2xl border bg-white shadow-soft" data-testid={`asset-${a.id}`}>
              <div className="flex h-28 items-center justify-center bg-secondary/60">
                {a.kind === "image" && a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.fileName || "asset"} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl">{a.kind === "youtube" ? "▶" : "🎬"}</span>
                )}
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  {kindIcon(a.kind)}
                  <span className="truncate">{a.fileName || "Asset"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="border bg-white text-[10px]">{a.kind}</Badge>
                  {a.ghlUrl ? (
                    <Badge className="bg-emerald-50 text-emerald-700 text-[10px] hover:bg-emerald-50">
                      <RiCloudLine className="mr-1 h-3 w-3" /> on GHL CDN
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 rounded-full px-2 text-[10px]"
                      disabled={pushing === a.id || a.kind === "youtube"}
                      onClick={() => pushToGhl(a)}
                    >
                      {pushing === a.id ? "Pushing…" : "Push to GHL"}
                    </Button>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={() => remove(a)}>
                    <RiDeleteBinLine className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MediaPage() {
  return (
    <DashboardShellLoader>
      <MediaData />
    </DashboardShellLoader>
  );
}