import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, withTenantDb } from "@/lib/tenantDb";
import { ghlConfigured, ghlAuthorizeUrl, connectPit, GHL_SCOPES } from "@/lib/ghl";
import { validatePitToken } from "@/lib/ghl";
import { resetDemoFailures } from "@/lib/ghlDemo";
import { encrypt } from "@/lib/crypto";

/**
 * POST /api/ghl/connect — three ways in:
 *  DEMO: simulated connect.
 *  PIT:  body { mode: "PIT", pitToken } — validated live, stored encrypted.
 *  LIVE: returns the marketplace authorize URL (needs env credentials).
 */
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const input = (await req.json().catch(() => ({}))) as {
    demo?: boolean;
    mode?: "DEMO" | "PIT" | "LIVE";
    pitToken?: string;
  };

  return withTenantDb(guard.auth.agencyId, async () => {
    // Private Integration path
    if (input.mode === "PIT") {
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
      await connectPit(guard.auth.agencyId, token, check.sampleLocation);
      return NextResponse.json({ ok: true, mode: "PIT", sample: check.sampleLocation });
    }

    const demo = input.mode !== "LIVE" && (input.demo === true || !ghlConfigured());
    if (demo) {
      await db.ghLConnection.upsert({
        where: { agencyId: guard.auth.agencyId },
        create: { agencyId: guard.auth.agencyId, mode: "DEMO", tokenType: "Agency" },
        update: { mode: "DEMO", connectedAt: new Date(), lastError: null },
      });
      await resetDemoFailures();
      await db.tokenEvent.create({
        data: { agencyId: guard.auth.agencyId, kind: "connect", detail: "Demo Mode connected (simulated OAuth)" },
      });
      return NextResponse.json({ ok: true, demo: true });
    }

    return NextResponse.json({
      ok: true,
      demo: false,
      mode: "LIVE",
      authorizeUrl: ghlAuthorizeUrl(new URL(req.url).origin),
      scopes: GHL_SCOPES,
    });
  });
}

void encrypt;