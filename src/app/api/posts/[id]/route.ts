import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { trimForPlatform, isPlatformId, CATEGORIES } from "@/lib/platforms";

// GET a single post
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const post = await prisma.post.findFirst({
    where: { id, client: { agencyId: guard.auth.agencyId } },
    include: { media: { include: { mediaAsset: true } } },
  });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  return NextResponse.json({ post });
}

// PATCH — inline edit. Body can include: body, time, scheduledDate, hashtags, title, mediaAssetIds
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const post = await prisma.post.findFirst({
    where: { id, client: { agencyId: guard.auth.agencyId } },
  });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  const input = (await req.json().catch(() => ({}))) as {
    body?: string;
    time?: string;
    scheduledDate?: string;
    hashtags?: string;
    title?: string;
    mediaAssetIds?: string[];
    status?: string;
  };
  const data: Record<string, unknown> = {};
  if (typeof input.body === "string") data.body = trimForPlatform(post.platform, input.body);
  if (typeof input.title === "string") data.title = input.title.slice(0, 100);
  if (typeof input.hashtags === "string") data.hashtags = input.hashtags;
  if (typeof input.time === "string" && /^\d{2}:\d{2}$/.test(input.time)) data.time = input.time;
  if (typeof input.scheduledDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate)) {
    data.scheduledDate = new Date(input.scheduledDate + "T00:00:00.000Z");
  }
  if (input.status && ["DRAFT", "APPROVED"].includes(input.status) && post.status !== "SCHEDULED" && post.status !== "POSTED") {
    data.status = input.status;
  }
  if (Array.isArray(input.mediaAssetIds)) {
    // Verify assets belong to the same client, then replace links
    const assets = await prisma.mediaAsset.findMany({
      where: { id: { in: input.mediaAssetIds }, clientId: post.clientId },
    });
    await prisma.postMedia.deleteMany({ where: { postId: id } });
    if (assets.length) {
      await prisma.postMedia.createMany({
        data: assets.map((a, i) => ({ postId: id, mediaAssetId: a.id, order: i })),
      });
    }
  }
  const updated = await prisma.post.update({ where: { id }, data, include: { media: { include: { mediaAsset: true } } } });
  return NextResponse.json({ ok: true, post: updated });
}

// DELETE a post (draft/approved only)
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const post = await prisma.post.findFirst({
    where: { id, client: { agencyId: guard.auth.agencyId } },
  });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (post.status === "SCHEDULED" || post.status === "POSTED") {
    return NextResponse.json({ error: "Scheduled/posted posts cannot be deleted here" }, { status: 400 });
  }
  await prisma.postMedia.deleteMany({ where: { postId: id } });
  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}