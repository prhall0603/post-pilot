import { prisma } from "@/lib/prisma";
import { createGhlPost, uploadToGhlCdn } from "@/lib/ghl";
import { PLATFORM_RULES, isPlatformId, type PlatformId } from "@/lib/platforms";

const SCHEDULING_WINDOW_MONTHS = 3; // rolling window GHL allowlists

export interface SchedulablePost {
  id: string;
  platform: string;
  scheduledDate: Date;
  time: string;
  body: string;
  title?: string | null;
  ghlAccountId?: string | null;
  media?: Array<{ mediaAsset: { kind: string; ghlUrl: string | null; url: string | null; youtubeId: string | null; fileName: string | null; mimeType: string | null } }>;
}

function windowEnd(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + SCHEDULING_WINDOW_MONTHS, 0, 23, 59, 59));
  return d;
}

/** The last date GHL will accept a schedule for (rolling ~3-month window). */
export function schedulingWindowEnd(): Date {
  return windowEnd();
}

export function canSchedule(p: { scheduledDate: Date }): boolean {
  return p.scheduledDate.getTime() <= windowEnd().getTime();
}

function toGhlScheduledAt(date: Date, time: string): string {
  const [h, m] = time.split(":").map((s) => parseInt(s, 10));
  const dt = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), isNaN(h) ? 9 : h, isNaN(m) ? 0 : m)
  );
  return dt.toISOString();
}

/** Validate a post against platform rules; return a reason string if blocked. */
export function validateForPlatform(
  p: SchedulablePost
): { ok: true } | { ok: false; reason: string; detail: string } {
  const platform = p.platform;
  if (!isPlatformId(platform)) {
    return { ok: false, reason: "Unknown platform", detail: `Platform "${platform}" is not supported.` };
  }
  const rules = PLATFORM_RULES[platform as PlatformId];

  if (p.body.length > rules.maxLen) {
    return {
      ok: false,
      reason: "Too long",
      detail: `Body is ${p.body.length} chars; ${rules.name} allows ${rules.maxLen}.`,
    };
  }
  if (rules.videoRequired) {
    const hasVideo = p.media?.some((m) => m.mediaAsset.kind === "video");
    const yt = p.media?.some((m) => m.mediaAsset.kind === "youtube");
    if (!hasVideo && !(platform === "tiktok" && p.media?.some((m) => m.mediaAsset.kind === "image")) && !(platform === "youtube" && yt)) {
      return {
        ok: false,
        reason: "Video required",
        detail: `${rules.name} scheduling requires a video${platform === "tiktok" ? " (or an image slideshow)" : ""}. Attach one in the media library first.`,
      };
    }
  }
  if (rules.mediaRequired && !p.media?.length) {
    return {
      ok: false,
      reason: "Media required",
      detail: `${rules.name} requires an image or video on every post.`,
    };
  }
  if (platform === "youtube") {
    const hasVideo = p.media?.some((m) => m.mediaAsset.kind === "video" || m.mediaAsset.kind === "youtube");
    if (!hasVideo) {
      return { ok: false, reason: "Video required", detail: "YouTube scheduling requires an uploaded video or a YouTube link." };
    }
    if (!p.title || p.title.trim().length < 3) {
      return { ok: false, reason: "Title required", detail: "YouTube posts need a title (and description as body)." };
    }
  }
  if (platform === "gbp" && p.body.length > 1200) {
    return { ok: false, reason: "Too long", detail: "Google Business Profile body must stay under 1200 chars." };
  }
  return { ok: true };
}

/** Upload one media asset to GHL CDN (idempotent via ghlUrl cache). */
export async function ensureGhlMedia(agencyId: string, locationId: string, asset: { id: string; kind: string; ghlUrl: string | null; url: string | null; fileName: string | null; mimeType: string | null; youtubeId: string | null }): Promise<string | null> {
  if (asset.kind === "youtube") return asset.url || (asset.youtubeId ? `https://www.youtube.com/watch?v=${asset.youtubeId}` : null);
  if (asset.ghlUrl) return asset.ghlUrl;
  if (!asset.url) return null;
  const res = await fetch(asset.url.startsWith("http") ? asset.url : new URL(asset.url, process.env.APP_ORIGIN || "http://localhost:3000").href);
  if (!res.ok) throw new Error(`Media fetch failed (${res.status}) for ${asset.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { url, mediaId } = await uploadToGhlCdn(agencyId, locationId, asset.fileName || `asset-${asset.id}`, asset.mimeType || "application/octet-stream", buf);
  await prisma.mediaAsset.update({ where: { id: asset.id }, data: { ghlUrl: url, ghlMediaId: mediaId } });
  return url;
}

/**
 * Schedule one post through GHL. Only APPROVED posts are ever scheduled here —
 * drafts cannot be scheduled by design.
 */
export async function schedulePost(agencyId: string, clientLocationId: string, postId: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { media: { include: { mediaAsset: true } } },
  });
  if (!post) throw new Error("Post not found");
  if (post.status !== "APPROVED") {
    throw new Error(
      post.status === "SCHEDULED" ? "Post is already scheduled." : "Only approved posts get scheduled — never drafts."
    );
  }
  if (post.scheduledDate > windowEnd()) {
    return; // outside rolling window; monthly re-run will pick it up
  }
  const v = validateForPlatform(post as unknown as SchedulablePost);
  if (!v.ok) {
    await prisma.post.update({
      where: { id: postId },
      data: { status: "FAILED", failureReason: v.reason, failureDetail: v.detail },
    });
    return;
  }
  try {
    const mediaUrls: string[] = [];
    for (const m of post.media) {
      const asset = m.mediaAsset;
      const url = await ensureGhlMedia(agencyId, clientLocationId, asset);
      if (url) mediaUrls.push(url);
    }
    const result = await createGhlPost(agencyId, clientLocationId, {
      platform: post.platform,
      accountId: post.ghlAccountId || undefined,
      body: post.body,
      mediaUrls,
      scheduledAt: toGhlScheduledAt(post.scheduledDate, post.time),
      title: post.title || undefined,
      gbpPostType: post.platform === "gbp" ? inferGbpType(post.category) : undefined,
      isThread: post.platform === "twitter" && post.body.length > PLATFORM_RULES.twitter.maxLen,
    });
    await prisma.post.update({
      where: { id: postId },
      data: { status: "SCHEDULED", ghlPostId: result.id, scheduledAt: new Date(), failureReason: null, failureDetail: null },
    });
  } catch (e) {
    await prisma.post.update({
      where: { id: postId },
      data: {
        status: "FAILED",
        scheduledAttempts: { increment: 1 },
        failureReason: "GHL rejected the post",
        failureDetail: e instanceof Error ? e.message : String(e),
      },
    });
  }
}

export function inferGbpType(category: string): string {
  if (category === "promotional") return "offer";
  if (category === "local_community") return "event";
  return "update";
}

/**
 * Schedule everything approved+within-window for a client (used by bulk
 * schedule, "schedule next window", and the monthly re-run).
 */
export async function scheduleApprovedForClient(
  agencyId: string,
  clientId: string
): Promise<{ scheduled: number; failed: number; skippedWindow: number }> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Client not found");
  if (!client.locationId) throw new Error("Client has no GHL sub-account linked");

  const posts = await prisma.post.findMany({
    where: { clientId, status: "APPROVED" },
    include: { media: { include: { mediaAsset: true } } },
    orderBy: { scheduledDate: "asc" },
  });

  let scheduled = 0;
  let failed = 0;
  let skippedWindow = 0;
  for (const post of posts) {
    if (post.scheduledDate > windowEnd()) {
      skippedWindow++;
      continue;
    }
    const before = post.status;
    await schedulePost(agencyId, client.locationId, post.id);
    const after = await prisma.post.findUnique({ where: { id: post.id }, select: { status: true } });
    if (after?.status === "SCHEDULED") scheduled++;
    else if (after?.status === "FAILED") failed++;
    else if (before === "SCHEDULED") scheduled++;
  }
  await prisma.scheduledRun.create({
    data: { clientId, monthStart: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)), status: failed > 0 ? "partial" : "completed", scheduled, failed, detail: `${scheduled} scheduled, ${failed} failed, ${skippedWindow} beyond window` },
  });
  return { scheduled, failed, skippedWindow };
}