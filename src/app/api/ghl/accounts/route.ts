import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listAccounts } from "@/lib/ghl";
import { prisma } from "@/lib/prisma";
import { isPlatformId } from "@/lib/platforms";

// GET /api/ghl/accounts?locationId=... — connected platform accounts per sub-account.
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const locationId = new URL(req.url).searchParams.get("locationId");
  if (!locationId) return NextResponse.json({ error: "locationId required" }, { status: 400 });
  try {
    const accounts = await listAccounts(guard.auth.agencyId, locationId);
    return NextResponse.json({ accounts });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list accounts" },
      { status: 500 }
    );
  }
}

// POST /api/ghl/accounts — assign platform target accounts per client
// body: { clientId, assignments: [{ platform, ghlAccountId, accountName, avatarUrl? }] }
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const input = (await req.json().catch(() => ({}))) as {
    clientId?: string;
    locationId?: string;
    assignments?: Array<{ platform?: string; ghlAccountId?: string; accountName?: string; avatarUrl?: string }>;
  };
  if (!input.clientId || !input.locationId) {
    return NextResponse.json({ error: "clientId and locationId required" }, { status: 400 });
  }
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, agencyId: guard.auth.agencyId },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  await prisma.platformAccount.deleteMany({ where: { clientId: input.clientId } });
  const assigns = (input.assignments || []).filter(
    (a): a is { platform: string; ghlAccountId: string; accountName: string; avatarUrl?: string } =>
      Boolean(a.platform && isPlatformId(a.platform) && a.ghlAccountId)
  );
  if (assigns.length) {
    await prisma.platformAccount.createMany({
      data: assigns.map((a) => ({
        clientId: input.clientId!,
        locationId: input.locationId!,
        platform: a.platform,
        ghlAccountId: a.ghlAccountId,
        accountName: a.accountName || a.ghlAccountId,
        avatarUrl: a.avatarUrl || null,
        lastSyncedAt: new Date(),
      })),
    });
  }
  return NextResponse.json({ ok: true, assigned: assigns.length });
}