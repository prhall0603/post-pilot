import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isPlatformId } from "@/lib/platforms";

/** GET /api/clients/[id]/platforms — enabled platforms + cadences. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const client = await prisma.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const platforms = await prisma.clientPlatform.findMany({ where: { clientId: id } });
  return NextResponse.json({ platforms });
}

/** PUT /api/clients/[id]/platforms — replace platform selection + cadences. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const client = await prisma.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const input = (await req.json().catch(() => ({}))) as {
    platforms?: Array<{ platform: string; cadenceWeekly?: number }>;
    regenerateRemaining?: boolean;
  };
  const platforms = (input.platforms || []).filter((p) => isPlatformId(p.platform));
  if (!platforms.length) {
    return NextResponse.json({ error: "At least one platform required" }, { status: 400 });
  }
  const { clearUnscheduledFrom, generateYearPlan } = await import("@/lib/ai");
  const regenerating = input.regenerateRemaining === true;
  if (regenerating) {
    await clearUnscheduledFrom(id);
  }
  await prisma.clientPlatform.deleteMany({ where: { clientId: id } });
  await prisma.clientPlatform.createMany({
    data: platforms.map((p) => ({
      clientId: id,
      platform: p.platform,
      cadenceWeekly: Math.max(1, Math.min(7, Math.round(p.cadenceWeekly ?? 3))),
    })),
  });
  if (regenerating) {
    await generateYearPlan(id, 12).catch((e) => {
      throw Object.assign(new Error(e instanceof Error ? e.message : "Regeneration failed"), { status: 500 });
    });
  }
  const updated = await prisma.clientPlatform.findMany({ where: { clientId: id } });
  return NextResponse.json({ ok: true, platforms: updated });
}