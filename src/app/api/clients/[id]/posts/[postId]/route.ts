import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { trimForPlatform, isPlatformId } from "@/lib/platforms";

/** PATCH /api/clients/[id]/posts/[postId] — inline edit a post. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; postId: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id, postId } = await ctx.params;
  const post = await prisma.post.findFirst({ where: { id: postId, clientId: id } });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if ("body" in input && typeof input.body === "string") {
    const trimmed = post.platform === "twitter" && isPlatformId(post.platform)
      ? input.body
      : trimForPlatform(post.platform, input.body);
    data.body = trimmed;
  }
  if ("time" in input && typeof input.time === "string" && /^\d{2}:\d{2}$/.test(input.time)) data.time = input.time;
  if ("scheduledDate" in input && typeof input.scheduledDate === "string") {
    data.scheduledDate = new Date(input.scheduledDate + "T00:00:00.000Z");
  }
  if ("hashtags" in input) data.hashtags = input.hashtags === "" ? null : String(input.hashtags);
  if ("imagePrompt" in input) data.imagePrompt = input.imagePrompt === "" ? null : String(input.imagePrompt);
  if ("videoScript" in input) data.videoScript = input.videoScript === "" ? null : String(input.videoScript);
  if ("title" in input) data.title = input.title === "" ? null : String(input.title);
  if ("ghlAccountId" in input) data.ghlAccountId = input.ghlAccountId === "" ? null : String(input.ghlAccountId);
  // Draft edits reset an approval so a reviewer always signs off on the final copy.
  if (Object.keys(data).length && (post.status === "APPROVED" || post.status === "DRAFT") && !("status" in input)) {
    data.status = "DRAFT";
  }
  const updated = await prisma.post.update({ where: { id: postId }, data });
  return NextResponse.json({ ok: true, post: updated });
}

/** DELETE /api/clients/[id]/posts/[postId] — remove a post (unscheduled only). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; postId: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id, postId } = await ctx.params;
  const post = await prisma.post.findFirst({ where: { id: postId, clientId: id } });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (post.status === "SCHEDULED" || post.status === "POSTED") {
    return NextResponse.json({ error: "Scheduled/posted posts can only be managed in GHL" }, { status: 400 });
  }
  await prisma.post.delete({ where: { id: postId } });
  return NextResponse.json({ ok: true });
}