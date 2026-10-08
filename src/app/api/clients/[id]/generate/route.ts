import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateYearPlan } from "@/lib/ai";

// POST /api/clients/[id]/generate — start 12-month generation in monthly batches.
// The actual batch loop runs client-side via /generate-step so progress can be
// shown ("Generating March... 4/12"). This route resets state and returns the
// batch plan.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
  if (client.planStatus === "GENERATING") {
    return NextResponse.json({ error: "Generation already running" }, { status: 409 });
  }
  await prisma.client.update({ where: { id }, data: { planStatus: "GENERATING" } });
  const already = client.generatedUntil
    ? Math.max(
        0,
        12 -
          (new Date().getUTCFullYear() - client.generatedUntil.getUTCFullYear()) * 12 -
          (new Date().getUTCMonth() - client.generatedUntil.getUTCMonth())
      )
    : 12;
  return NextResponse.json({ ok: true, monthsRemaining: Math.max(0, already) });
}

// STEP: generate a single month — called in sequence with progress UI.
// POST /api/clients/[id]/generate  → handled above; step route separate.