import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateYearPlan } from "@/lib/ai";
import { firstOfMonth } from "@/lib/ai";

// POST /api/clients/[id]/generate/step — generate ONE month (progressive).
// Body: {} → next month after generatedUntil (or current month). Runs the full
// per-month pipeline: slot planning, AI call (with retry), trimming, persist.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const client = await prisma.client.findFirst({
    where: { id, agencyId: guard.auth.agencyId },
    include: { platforms: true, products: true, blackoutDates: true },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // The per-month call lives in ai.ts; we reuse generateYearPlan with months=1
  // so state transitions (GENERATING → GENERATED) and persistence are shared.
  try {
    await generateYearPlan(id, 1);
    const after = await prisma.client.findUnique({
      where: { id },
      select: { generatedUntil: true, planStatus: true, aiCostEstimated: true, totalPosts: false },
    });
    const posts = await prisma.post.count({ where: { clientId: id } });
    return NextResponse.json({ ok: true, generatedUntil: after?.generatedUntil, totalPosts: posts });
  } catch (e) {
    await prisma.client.update({ where: { id }, data: { planStatus: "GENERATED" } }).catch(() => {});
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generation step failed" },
      { status: 500 }
    );
  }
}