import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, withTenantDb } from "@/lib/tenantDb";

/** POST /api/ghl/disconnect — clear stored tokens + set the workspace to Demo. */
export async function POST() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    await db.ghLConnection.updateMany({
      where: { agencyId: guard.auth.agencyId },
      data: {
        mode: "DEMO",
        clientId: null,
        clientSecretEnc: null,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        expiresAt: null,
        scope: null,
        userId: null,
        locationId: null,
        lastError: null,
        connectedAt: new Date(),
        lastRefreshedAt: null,
      },
    });
    await db.tokenEvent.create({
      data: { agencyId: guard.auth.agencyId, kind: "disconnect", detail: "Disconnected; reverted to Demo Mode" },
    });
    return NextResponse.json({ ok: true });
  });
}