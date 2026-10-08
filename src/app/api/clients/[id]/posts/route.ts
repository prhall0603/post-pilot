import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/clients/[id]/posts?year=&month=&platform=&status=
 * Posts for the calendar grid + counts for filters.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const client = await prisma.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const sp = new URL(req.url).searchParams;
  const year = Number(sp.get("year")) || new Date().getFullYear();
  const month = Number(sp.get("month")); // 1-12, optional
  const platform = sp.get("platform");
  const status = sp.get("status");

  const where: Record<string, unknown> = { clientId: id };
  if (platform) where.platform = platform;
  if (status) where.status = status.toUpperCase();
  if (month >= 1 && month <= 12) {
    where.scheduledDate = {
      gte: new Date(Date.UTC(year, month - 1, 1)),
      lt: new Date(Date.UTC(year, month, 1)),
    };
  }

  const posts = await prisma.post.findMany({
    where,
    include: { media: { include: { mediaAsset: { select: { id: true, kind: true, url: true, fileName: true, youtubeId: true } } } } },
    orderBy: [{ scheduledDate: "asc" }, { time: "asc" }],
  });

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      platform: p.platform,
      scheduledDate: p.scheduledDate,
      time: p.time,
      body: p.body,
      title: p.title,
      hashtags: p.hashtags,
      imagePrompt: p.imagePrompt,
      videoScript: p.videoScript,
      status: p.status,
      contentTopic: p.contentTopic,
      category: p.category,
      mediaRequired: p.mediaRequired,
      ghlAccountId: p.ghlAccountId,
      failureReason: p.failureReason,
      failureDetail: p.failureDetail,
      scheduledAttempts: p.scheduledAttempts,
      ghlPostId: p.ghlPostId,
      media: p.media.map((m) => ({
        id: m.mediaAsset.id,
        kind: m.mediaAsset.kind,
        url: m.mediaAsset.url,
        fileName: m.mediaAsset.fileName,
        youtubeId: m.mediaAsset.youtubeId,
      })),
    })),
    aiCostEstimated: client.aiCostEstimated,
    aiTokensEstimated: client.aiTokensEstimated,
  });
}