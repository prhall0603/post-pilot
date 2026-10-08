import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleApprovedForClient } from "@/lib/scheduler";

// POST /api/clients/[id]/schedule-window — "Schedule next window" (monthly
// re-run): approves nothing, schedules approved posts in the rolling window.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const client = await prisma.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  try {
    const result = await scheduleApprovedForClient(guard.auth.agencyId, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scheduling failed" },
      { status: 500 }
    );
  }
}