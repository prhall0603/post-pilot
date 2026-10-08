import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateYearPlan, firstOfMonth, addMonths, monthName } from "@/lib/ai";

/**
 * POST /api/clients/[id]/generate/step — generate ONE month, persist it, and
 * report which month ran. Called in sequence by the UI (12 calls total) so
 * progress can be displayed ("Generating March... 4/12") with retries
 * surfaced per batch. Persists as it goes — a reload never loses the plan.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const client = await prisma.client.findFirst({
    where: { id, agencyId: guard.auth.agencyId },
    select: { id: true, generatedUntil: true },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const base =
    client.generatedUntil && isFinite(new Date(client.generatedUntil).getTime())
      ? addMonths(firstOfMonth(client.generatedUntil), 1)
      : firstOfMonth(new Date());

  const monthLabel = monthName(base);
  try {
    await generateYearPlan(id, 1);
    const after = await prisma.client.findUnique({
      where: { id },
      select: { generatedUntil: true, planStatus: true, aiCostEstimated: true, aiTokensEstimated: true },
    });
    const totalPosts = await prisma.post.count({ where: { clientId: id } });
    const monthCount = await prisma.post.count({
      where: {
        clientId: id,
        scheduledDate: { gte: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1)) },
      },
    });
    return NextResponse.json({
      ok: true,
      monthLabel,
      generatedUntil: after?.generatedUntil,
      planStatus: after?.planStatus,
      totalPosts,
      monthPosts: monthCount,
      aiCostEstimated: after?.aiCostEstimated,
    });
  } catch (e) {
    await prisma.client.update({ where: { id }, data: { planStatus: "GENERATED" } }).catch(() => {});
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generation step failed", monthLabel },
      { status: 500 }
    );
  }
}