import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// PUT /api/clients/[id]/platforms — replace cadence/platform selection
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const client = await prisma.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const input = (await req.json().catch(() => ({}))) as {
    platforms?: Array<{ platform: string; cadenceWeekly?: number }>;
  };
  if (!input.platforms?.length) {
    return NextResponse.json({ error: "At least one platform required" }, { status: 400 });
  }
  await prisma.clientPlatform.deleteMany({ where: { clientId: id } });
  await prisma.clientPlatform.createMany({
    data: input.platforms.map((p) => ({
      clientId: id,
      platform: p.platform,
      cadenceWeekly: Math.max(1, Math.min(7, Math.round(p.cadenceWeekly ?? 3))),
    })),
  });
  return NextResponse.json({ ok: true });
}

// GET /api/clients/[id]/platforms
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const platforms = await prisma.clientPlatform.findMany({ where: { clientId: id } });
  return NextResponse.json({ platforms });
}