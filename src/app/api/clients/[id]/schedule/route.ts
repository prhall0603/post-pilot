import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { scheduleApprovedForClient, schedulePost } from "@/lib/scheduler";

// POST /api/clients/[id]/schedule — schedule window for a client
// body: { postIds?: string[] } → when provided schedules only those (one-click
// retry for failed posts); otherwise schedules all approved posts in the
// rolling ~3-month window (bulk action + monthly re-run).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const client = await prisma.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const input = (await req.json().catch(() => ({}))) as { postIds?: string[] };
  try {
    if (input.postIds?.length) {
      // Retry path: failed posts come back as APPROVED, then re-run the
      // single-post pipeline which revalidates platform rules.
      const retries = await prisma.post.findMany({
        where: { id: { in: input.postIds }, clientId: id, status: { in: ["APPROVED", "FAILED"] } },
      });
      for (const post of retries) {
        if (post.status === "FAILED") {
          await prisma.post.update({ where: { id: post.id }, data: { status: "APPROVED" } });
        }
        await schedulePost(guard.auth.agencyId, client.locationId!, post.id);
      }
      const after = await prisma.post.findMany({
        where: { id: { in: retries.map((r) => r.id) } },
        select: { status: true },
      });
      const scheduled = after.filter((p) => p.status === "SCHEDULED" || p.status === "POSTED").length;
      const stillFailed = after.filter((p) => p.status === "FAILED").length;
      return NextResponse.json({ ok: true, scheduled, failed: stillFailed });
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