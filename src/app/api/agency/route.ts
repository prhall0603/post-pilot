import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** GET /api/agency — workspace settings. */
export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const agency = await prisma.agency.findUnique({
    where: { id: guard.auth.agencyId },
    select: { id: true, email: true, demoMode: true },
  });
  return NextResponse.json({ agency });
}

/** PATCH /api/agency — toggle demo mode / update workspace settings. */
export async function PATCH(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const input = (await req.json().catch(() => ({}))) as { demoMode?: boolean };
  if (typeof input.demoMode === "boolean") {
    await prisma.agency.update({
      where: { id: guard.auth.agencyId },
      data: { demoMode: input.demoMode },
    });
  }
  const agency = await prisma.agency.findUnique({
    where: { id: guard.auth.agencyId },
    select: { id: true, email: true, demoMode: true },
  });
  return NextResponse.json({ ok: true, agency });
}