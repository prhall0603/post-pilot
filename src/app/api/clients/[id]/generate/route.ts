import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { firstOfMonth, addMonths } from "@/lib/ai";

/**
 * POST /api/clients/[id]/generate — start/reset a 12-month generation.
 * The batch loop runs client-side against /generate/step so the UI can show
 * progress ("Generating March... 4/12") while each month persists.
 * Optionally deletes unscheduled posts first (regenerate-remaining flow).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const client = await prisma.client.findFirst({
    where: { id, agencyId: guard.auth.agencyId },
    include: { platforms: true },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (client.platforms.length === 0) {
    return NextResponse.json({ error: "No platforms selected for this client" }, { status: 400 });
  }
  const input = (await req.json().catch(() => ({}))) as { regenerateRemaining?: boolean };

  if (input.regenerateRemaining) {
    const { clearUnscheduledFrom } = await import("@/lib/ai");
    const removed = await clearUnscheduledFrom(id);
    return NextResponse.json({ ok: true, removed, monthsRemaining: 12 });
  }

  if (client.planStatus === "GENERATING") {
    return NextResponse.json({ error: "Generation already running" }, { status: 409 });
  }
  await prisma.client.update({ where: { id }, data: { planStatus: "GENERATING" } });
  const base = client.generatedUntil ? addMonths(firstOfMonth(client.generatedUntil), 1) : firstOfMonth(new Date());
  const now = new Date();
  const monthsRemaining = Math.max(
    1,
    12 - Math.max(0, (base.getUTCFullYear() - now.getUTCFullYear()) * 12 + (base.getUTCMonth() - now.getUTCMonth()))
  );
  return NextResponse.json({ ok: true, monthsRemaining });
}