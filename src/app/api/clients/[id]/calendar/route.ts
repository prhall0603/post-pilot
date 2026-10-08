import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/clients/[id]/dashboard — counts by month/platform/status
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const client = await prisma.client.findFirst({
    where: { id, agencyId: guard.auth.agencyId },
    include: { platforms: true, platformAccounts: true },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const posts = await prisma.post.findMany({
    where: { clientId: id },
    select: { platform: true, status: true, scheduledDate: true },
  });
  const byMonth: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const p of posts) {
    const m = p.scheduledDate.toISOString().slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + 1;
    byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1;
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  }
  return NextResponse.json({
    client: {
      id: client.id,
      name: client.name,
      planStatus: client.planStatus,
      generatedUntil: client.generatedUntil,
      aiCostEstimated: client.aiCostEstimated,
      aiTokensEstimated: client.aiTokensEstimated,
      locationId: client.locationId,
    },
    platforms: client.platforms,
    platformAccounts: client.platformAccounts,
    counts: { byMonth, byPlatform, byStatus, total: posts.length },
  });
}