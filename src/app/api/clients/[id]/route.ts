import { db, withTenantDb } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

/** GET /api/clients/[id] — full client with platforms, products, blackouts. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    const { id } = await ctx.params;
    const client = await db.client.findFirst({
      where: { id, agencyId: guard.auth.agencyId },
      include: {
        platforms: true,
        products: true,
        blackoutDates: { orderBy: { date: "asc" } },
        platformAccounts: true,
        scheduledRuns: { orderBy: { createdAt: "desc" }, take: 6 },
      },
    });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    return NextResponse.json({ client });
  });
}

/** PATCH /api/clients/[id] — update profile / brand / cadence settings. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    const { id } = await ctx.params;
    const existing = await db.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
    if (!existing) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    const fields = [
      "name",
      "industry",
      "website",
      "locationId",
      "brandVoice",
      "brandVoiceNotes",
      "targetAudience",
      "serviceArea",
      "logoUrl",
    ] as const;
    for (const f of fields) {
      if (f in input) data[f] = input[f] === "" ? null : input[f];
    }
    if (typeof data.name === "string" && !data.name.trim()) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }
    const client = await db.client.update({ where: { id }, data });
    return NextResponse.json({ ok: true, client });
  });
}

/** DELETE /api/clients/[id] */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    const { id } = await ctx.params;
    const existing = await db.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
    if (!existing) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    await db.client.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}