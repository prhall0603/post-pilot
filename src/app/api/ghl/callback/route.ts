import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { exchangeCode, ghlConfigured } from "@/lib/ghl";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/ghl/callback?code=... — GHL OAuth redirect target for the
 * marketplace app. Exchanges the code for Agency tokens (encrypted at rest).
 * GET without code → error UI.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.redirect(new URL("/login?error=session", req.url));
  }
  const code = new URL(req.url).searchParams.get("code");
  const error = new URL(req.url).searchParams.get("error");
  if (error || !code) {
    await prisma.ghLConnection.updateMany({
      where: { agencyId: auth.agencyId },
      data: { lastError: `Authorization failed: ${error || "missing code"}` },
    });
    return NextResponse.redirect(new URL("/settings/agency?ghl=denied", req.url));
  }
  if (!ghlConfigured()) {
    return NextResponse.redirect(new URL("/settings/agency?ghl=not_configured", req.url));
  }
  try {
    await prisma.ghLConnection.upsert({
      where: { agencyId: auth.agencyId },
      create: { agencyId: auth.agencyId, mode: "DEMO", tokenType: "Agency" },
      update: {},
    });
    await exchangeCode(
      auth.agencyId,
      code,
      process.env.GHL_CLIENT_ID!,
      process.env.GHL_CLIENT_SECRET!,
      process.env.GHL_REDIRECT_URI || new URL("/api/ghl/callback", req.url).href
    );
    return NextResponse.redirect(new URL("/settings/agency?ghl=connected", req.url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token exchange failed";
    await prisma.ghLConnection.updateMany({
      where: { agencyId: auth.agencyId },
      data: { lastError: msg },
    });
    await prisma.tokenEvent.create({
      data: { agencyId: auth.agencyId, kind: "connect_error", detail: msg },
    });
    return NextResponse.redirect(new URL("/settings/agency?ghl=error", req.url));
  }
}