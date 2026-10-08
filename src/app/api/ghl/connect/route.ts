import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ghlConfigured, ghlAuthorizeUrl, GHL_SCOPES } from "@/lib/ghl";
import { resetDemoFailures } from "@/lib/ghlDemo";

/**
 * POST /api/ghl/connect — returns the GHL authorization URL to open.
 * LIVE: marketplace app authorize screen. DEMO: simulated connect used while
 * no marketplace credentials exist.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const input = (await req.json().catch(() => ({}))) as { demo?: boolean };

  const demo = input.demo === true || !ghlConfigured();
  if (demo) {
    // Demo Mode connect — simulate the OAuth handshake.
    await prisma.ghLConnection.upsert({
      where: { agencyId: guard.auth.agencyId },
      create: { agencyId: guard.auth.agencyId, mode: "DEMO", tokenType: "Agency" },
      update: { mode: "DEMO", connectedAt: new Date(), lastError: null },
    });
    await resetDemoFailures();
    await prisma.tokenEvent.create({
      data: { agencyId: guard.auth.agencyId, kind: "connect", detail: "Demo Mode connected (simulated OAuth)" },
    });
    return NextResponse.json({ ok: true, demo: true });
  }

  return NextResponse.json({
    ok: true,
    demo: false,
    authorizeUrl: ghlAuthorizeUrl(new URL(req.url).origin),
    scopes: GHL_SCOPES,
  });
}