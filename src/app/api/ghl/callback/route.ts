import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/ghl";
import { ghlConfigured } from "@/lib/ghl";

// GET /api/ghl/callback — GHL OAuth redirect target.
// Exchanges the code for Agency tokens and stores them (encrypted).
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/settings/agency?ghl=error", url.origin));
  }
  const clientId = process.env.GHL_CLIENT_ID || "";
  const clientSecret = process.env.GHL_CLIENT_SECRET || "";
  if (!ghlConfigured()) {
    return NextResponse.redirect(new URL("/settings/agency?ghl=notconfigured", url.origin));
  }
  try {
    // The callback is unauthenticated by nature; the code exchange validates it.
    const agency = await prisma.agency.findFirst();
    if (!agency) throw new Error("No agency workspace found");
    await exchangeCode(agency.id, code, clientId, clientSecret);
    await prisma.tokenEvent.create({
      data: { agencyId: agency.id, kind: "connect", detail: "Marketplace app connected (LIVE)" },
    });
    return NextResponse.redirect(new URL("/settings/agency?ghl=connected", url.origin));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const agency = await prisma.agency.findFirst();
    if (agency) {
      await prisma.tokenEvent.create({
        data: { agencyId: agency.id, kind: "refresh_error", detail: `Connect failed: ${msg}` },
      });
    }
    return NextResponse.redirect(
      new URL(`/settings/agency?ghl=error&detail=${encodeURIComponent(msg.slice(0, 120))}`, url.origin)
    );
  }
}