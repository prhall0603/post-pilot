import { db, withTenantDb } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateYearPlan, firstOfMonth, addMonths, monthName } from "@/lib/ai";

/**
 * POST /api/clients/[id]/generate/step — generate ONE month, persist it, and
 * report which month ran. Called in sequence by the UI (12 calls total).
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    const { id } = await ctx.params;
    const client = await db.client.findFirst({
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
      const after = await db.client.findUnique({
        where: { id },
        select: { generatedUntil: true, planStatus: true, aiCostEstimated: true, aiTokensEstimated: true },
      });
      const totalPosts = await db.post.count({ where: { clientId: id } });
      const monthCount = await db.post.count({
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
      await db.client.update({ where: { id }, data: { planStatus: "GENERATED" } }).catch(() => {});
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Generation step failed", monthLabel },
        { status: 500 }
      );
    }
  });
}