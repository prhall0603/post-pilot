import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prisma as tenant, evictTenantClient } from "@/lib/tenantDb";
import { ghlConfigured, validatePitToken, connectPit } from "@/lib/ghl";
import { encrypt } from "@/lib/crypto";
import { getConnectionMode } from "@/lib/ghl";

/**
 * POST /api/onboarding/finish — completes workspace onboarding.
 * body: { ghlMode?: "DEMO" | "PIT" | "LIVE", pitToken?: string }
 * PIT tokens are validated live against GHL before being stored encrypted.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const agencyId = guard.auth.agencyId;
  const input = (await req.json().catch(() => ({}))) as {
    ghlMode?: "DEMO" | "PIT" | "LIVE";
    pitToken?: string;
  };

  if (input.ghlMode === "PIT") {
    const token = (input.pitToken || "").trim();
    if (!/^pit-.{6,}$/.test(token)) {
      return NextResponse.json(
        { error: "Enter a valid Private Integration token (starts with pit-)" },
        { status: 400 }
      );
    }
    const check = await validatePitToken(token);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
    await connectPit(agencyId, token, check.sampleLocation);
  } else if (input.ghlMode === "LIVE") {
    if (!ghlConfigured()) {
      return NextResponse.json(
        { error: "Marketplace credentials (GHL_CLIENT_ID / GHL_CLIENT_SECRET) are not configured in this deployment" },
        { status: 400 }
      );
    }
    // LIVE completes via the OAuth redirect flow; here we just verify config.
  }

  const finalMode = await getConnectionMode(agencyId);
  await prisma.agency.update({ where: { id: agencyId }, data: { onboarded: true } });
  return NextResponse.json({ ok: true, ghlMode: finalMode });
}

/** GET /api/onboarding/finish — current GHL mode for the final review card. */
export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const mode = await getConnectionMode(guard.auth.agencyId);
  const agency = await prisma.agency.findUnique({
    where: { id: guard.auth.agencyId },
    select: { dbMode: true, dbLabel: true, onboarded: true },
  });
  return NextResponse.json({
    ghlMode: mode,
    dbMode: agency?.dbMode || "HOSTED",
    dbLabel: agency?.dbLabel || null,
    onboarded: agency?.onboarded || false,
  });
}

// keep tenant import referenced for future finish-time tenant work
void tenant;
void evictTenantClient;
void encrypt;