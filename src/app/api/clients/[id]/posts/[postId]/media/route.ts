import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

/** GET /api/clients/[id]/posts/[postId]/media — current attachments. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; postId: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id, postId } = await ctx.params;
  const post = await prisma.post.findFirst({ where: { id: postId, clientId: id } });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  const media = await prisma.postMedia.findMany({
    where: { postId },
    include: { mediaAsset: true },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ media });
}

/** POST /api/clients/[id]/posts/[postId]/media — attach a library asset. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; postId: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id, postId } = await ctx.params;
  const post = await prisma.post.findFirst({ where: { id: postId, clientId: id } });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  const input = (await req.json().catch(() => ({}))) as { assetId?: string };
  if (!input.assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });
  const asset = await prisma.mediaAsset.findFirst({ where: { id: input.assetId, clientId: id } });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const existing = await prisma.postMedia.findFirst({ where: { postId, mediaAssetId: asset.id } });
  if (existing) return NextResponse.json({ ok: true, already: true });
  const count = await prisma.postMedia.count({ where: { postId } });
  const pm = await prisma.postMedia.create({
    data: { postId, mediaAssetId: asset.id, order: count },
  });
  return NextResponse.json({ ok: true, media: pm });
}

/** DELETE /api/clients/[id]/posts/[postId]/media?assetId=... — detach. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; postId: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id, postId } = await ctx.params;
  const assetId = new URL(req.url).searchParams.get("assetId");
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });
  await prisma.postMedia.deleteMany({ where: { postId, mediaAssetId: assetId } });
  return NextResponse.json({ ok: true });
}