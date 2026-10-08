import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ghlAuthorizeUrl, ghlConfigured, ghlRedirectUri } from "@/lib/ghl";
import { prisma } from "@/lib/prisma";

// GET /api/ghl/connect — returns the GHL authorization URL (marketplace app).
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  if (!ghlConfigured()) {
    // Demo Mode connect: create a simulated agency connection instantly.
    await prisma.ghLConnection.upsert({
      where: { agencyId: guard.auth.agencyId },
      create: {
        agencyId: guard.auth.agencyId,
        mode: "DEMO",
        tokenType: "Agency",
        connectedAt: new Date(),
      },
      update: { mode: "DEMO", connectedAt: new Date(), lastError: null },
    });
    await prisma.tokenEvent.create({
      data: { agencyId: guard.auth.agencyId, kind: "connect", detail: "Demo Mode: simulated agency connection" },
    });
    return NextResponse.json({ mode: "DEMO", ok: true });
  }
  return NextResponse.json({
    mode: "LIVE",
    authorizeUrl: ghlAuthorizeUrl(new URL(req.url).origin),
    redirectUri: ghlRedirectUri(new URL(req.url).origin),
  });
}