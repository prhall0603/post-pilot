import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/ghl/disconnect — revoke local tokens.
export async function POST() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  await prisma.ghLConnection.deleteMany({ where: { agencyId: guard.auth.agencyId } });
  await prisma.tokenEvent.create({
    data: { agencyId: guard.auth.agencyId, kind: "revoke", detail: "Connection removed" },
  });
  return NextResponse.json({ ok: true });
}