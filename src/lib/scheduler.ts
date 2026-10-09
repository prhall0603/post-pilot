// Scheduling pipeline — Stage 3. Only APPROVED posts ever get scheduled;
// drafts cannot be scheduled by design. Media uploads to GHL CDN happen
// before the post call. Failures land in the "Needs attention" tray with the
// specific platform-blocked reason, never a generic error, never silently.

import { prisma } from "@/lib/prisma";
import { createGhlPost, uploadToGhlCdn } from "@/lib/ghl";
import { PLATFORM_RULES, isPlatformId, type PlatformId } from "@/lib/platforms";

const SCHEDULING_WINDOW_MONTHS = 3; // rolling ~3-month scheduling window

export interface SchedulablePost {
  id: string;
  platform: string;
  scheduledDate: Date;
  time: string;
  body: string;
  title?: string | null;
  ghlAccountId?: string | null;
  media?: Array<{
    mediaAsset: {
      kind: string;
      ghlUrl: string | null;
      url: string | null;
      youtubeId: string | null;
      fileName: string | null;
      mimeType: string | null;
    };
  }>;
}

/** Last date GHL will accept a schedule for (rolling window, end of month+N). */
export function schedulingWindowEnd(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + SCHEDULING_WINDOW_MONTHS, 0, 23, 59, 59));
}

export function canSchedule(date: Date): boolean {
  return date.getTime() <= schedulingWindowEnd().getTime();
}

function toGhlScheduledAt(date: Date, time: string): string {
  const [h, m] = time.split(":").map((s) => parseInt(s, 10));
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), isNaN(h) ? 9 : h, isNaN(m) ? 0 : m)
  ).toISOString();
}

/** Validate a post against platform rules; a structured reason if blocked. */
export function validateForPlatform(p: SchedulablePost): { ok: true } | { ok: false; reason: string; detail: string } {
  if (!isPlatformId(p.platform)) {
    return { ok: false, reason: "Unknown platform", detail: `Platform "${p.platform}" is not supported.` };
  }
  const rules = PLATFORM_RULES[p.platform as PlatformId];

  if (p.body.length > rules.maxLen) {
    return {
      ok: false,
      reason: "Too long",
      detail: `Body is ${p.body.length} chars; ${rules.name} allows ${rules.maxLen}.`,
    };
  }
  const hasImage = p.media?.some((m) => m.mediaAsset.kind === "image") || false;
  const hasVideo = p.media?.some((m) => m.mediaAsset.kind === "video") || false;
  const hasYouTube = p.media?.some((m) => m.mediaAsset.kind === "youtube") || false;

  if (rules.videoRequired && !hasVideo && !hasYouTube) {
    if (!(p.platform === "tiktok" && hasImage)) {
      return {
        ok: false,
        reason: "Video required",
        detail: `${rules.name} scheduling requires a video${p.platform === "tiktok" ? " (or an image slideshow)" : ""}. Attach one in the media library first.`,
      };
    }
  }
  if (rules.mediaRequired && !hasImage && !hasVideo && !hasYouTube) {
    return {
      ok: false,
      reason: "Media required",
      detail: `${rules.name} requires an image or video on every post.`,
    };
  }
  if (p.platform === "youtube" && (!p.title || p.title.trim().length < 3)) {
    return {
      ok: false,
      reason: "Title required",
      detail: "YouTube posts need a title (the body becomes the description).",
    };
  }
  if (p.platform === "gbp" && p.body.length > 1200) {
    return {
      ok: false,
      reason: "Too long",
      detail: "Google Business Profile body must stay under 1,200 chars.",
    };
  }
  return { ok: true };
}

export function inferGbpType(category: string): "update" | "event" | "offer" {
  if (category === "promotional") return "offer";
  if (category === "local_community") return "event";
  return "update";
}

/** Fetch a local file/url into a Buffer for CDN upload. */
async function fetchMediaBuffer(url: string): Promise<Buffer> {
  const absolute = url.startsWith("http")
    ? url
    : new URL(url, process.env.APP_ORIGIN || process.env.DYAD_TEST_BASE_URL || "http://localhost:3000").href;
  const res = await fetch(absolute);
  if (!res.ok) throw new Error(`Media fetch failed (${res.status}) for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Upload one media asset to GHL CDN (idempotent via ghlUrl cache). */
export async function ensureGhlMedia(
  agencyId: string,
  locationId: string,
  asset: { id: string; kind: string; ghlUrl: string | null; url: string | null; fileName: string | null; mimeType: string | null; youtubeId: string | null }
): Promise<string | null> {
  if (asset.kind === "youtube") {
    return asset.url || (asset.youtubeId ? `https://www.youtube.com/watch?v=${asset.youtubeId}` : null);
  }
  if (asset.ghlUrl) return asset.ghlUrl;
  if (!asset.url) return null;
  const buf = await fetchMediaBuffer(asset.url);
  const { url, mediaId } = await uploadToGhlCdn(
    agencyId,
    locationId,
    asset.fileName || `asset-${asset.id}`,
    asset.mimeType || "application/octet-stream",
    buf
  );
  await prisma.mediaAsset.update({ where: { id: asset.id }, data: { ghlUrl: url, ghlMediaId: mediaId } });
  return url;
}

/**
 * Schedule one post through GHL. Only APPROVED posts are scheduled; drafts are
 * never scheduled by design. Validation failures mark FAILED with a specific
 * platform reason; GHL call failures mark FAILED with the API's own message.
 */
export async function schedulePost(agencyId: string, clientLocationId: string, postId: string): Promise<"scheduled" | "failed" | "skipped"> {
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
  if (!canSchedule(post.scheduledDate)) {
    return "skipped"; // beyond rolling window; the monthly re-run picks it up
  }
  const v = validateForPlatform(post as unknown as SchedulablePost);
  if (!v.ok) {
    await prisma.post.update({
      where: { id: postId },
      data: { status: "FAILED", failureReason: v.reason, failureDetail: v.detail },
    });
    return "failed";
  }
  try {
    const mediaUrls: string[] = [];
    for (const m of post.media) {
      const url = await ensureGhlMedia(agencyId, clientLocationId, m.mediaAsset);
      if (url) mediaUrls.push(url);
    }
    const isThread = post.platform === "twitter" && post.body.length > PLATFORM_RULES.twitter.maxLen;
    const result = await createGhlPost(agencyId, clientLocationId, {
      platform: post.platform,
      accountId: post.ghlAccountId || undefined,
      body: post.body,
      mediaUrls,
      scheduledAt: toGhlScheduledAt(post.scheduledDate, post.time),
      title: post.title || undefined,
      gbpPostType: post.platform === "gbp" ? inferGbpType(post.category) : undefined,
      isThread,
    });
    await prisma.post.update({
      where: { id: postId },
      data: {
        status: "SCHEDULED",
        ghlPostId: result.id,
        scheduledAt: new Date(),
        failureReason: null,
        failureDetail: null,
      },
    });
    return "scheduled";
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
    return "failed";
  }
}

/**
 * Schedule everything approved+within-window for a client. Used by bulk
 * schedule, "schedule next window", and the automatic monthly re-run.
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
    if (!canSchedule(post.scheduledDate)) {
      skippedWindow += 1;
      continue;
    }
    const outcome = await schedulePost(agencyId, client.locationId, post.id);
    if (outcome === "scheduled") scheduled += 1;
    else if (outcome === "failed") failed += 1;
    else skippedWindow += 1;
  }
  const now = new Date();
  await prisma.scheduledRun.create({
    data: {
      clientId,
      monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      status: failed > 0 ? "partial" : "completed",
      scheduled,
      failed,
      detail: `${scheduled} scheduled, ${failed} failed, ${skippedWindow} beyond window`,
    },
  });
  await prisma.client.update({
    where: { id: clientId },
    data: { schedulingCursor: schedulingWindowEnd() },
  });
  return { scheduled, failed, skippedWindow };
}