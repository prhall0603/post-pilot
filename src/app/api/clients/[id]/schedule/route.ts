import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { scheduleApprovedForClient, schedulePost } from "@/lib/scheduler";

/**
 * POST /api/clients/[id]/schedule — schedule approved posts.
 * body: { postIds?: string[] } → when provided, retries exactly those
 * (one-click retry from the Needs-attention tray); otherwise schedules all
 * approved posts in the rolling ~3-month window (bulk action + monthly rerun).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const client = await prisma.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const input = (await req.json().catch(() => ({}))) as { postIds?: string[] };
  try {
    if (input.postIds?.length) {
      // Retry path: return failed posts to APPROVED, then re-run the
      // single-post pipeline which revalidates all platform rules.
      const retries = await prisma.post.findMany({
        where: { id: { in: input.postIds }, clientId: id, status: "FAILED" },
      });
      for (const post of retries) {
        await prisma.post.update({
          where: { id: post.id },
          data: {
            status: "APPROVED",
            failureReason: null,
            failureDetail: null,
            scheduledAttempts: { increment: 1 },
          },
        });
        await schedulePost(guard.auth.agencyId, client.locationId!, post.id);
      }
      const after = await prisma.post.findMany({
        where: { id: { in: retries.map((r) => r.id) } },
        select: { status: true, failureDetail: true },
      });
      return NextResponse.json({
        ok: true,
        scheduled: after.filter((p) => p.status === "SCHEDULED").length,
        failed: after.filter((p) => p.status === "FAILED").length,
        results: after,
      });
    }
    const result = await scheduleApprovedForClient(guard.auth.agencyId, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scheduling failed" },
      { status: 500 }
    );
  }
}

/** GET /api/clients/[id]/schedule — scheduling history (monthly re-run log). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const client = await prisma.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const runs = await prisma.scheduledRun.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return NextResponse.json({ runs, schedulingCursor: client.schedulingCursor });
}