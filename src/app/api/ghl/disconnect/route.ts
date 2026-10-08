import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** POST /api/ghl/disconnect — clear stored tokens + set the workspace to Demo. */
export async function POST() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  await prisma.ghLConnection.updateMany({
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
  await prisma.tokenEvent.create({
    data: { agencyId: guard.auth.agencyId, kind: "disconnect", detail: "Disconnected; reverted to Demo Mode" },
  });
  return NextResponse.json({ ok: true });
}