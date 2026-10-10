import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { withTenantDb } from "@/lib/tenantDb";

/** GET /api/agency — workspace settings. */
export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async (prisma) => {
    const agency = await prisma.agency.findUnique({
      where: { id: guard.auth.agencyId },
      select: { id: true, email: true, demoMode: true },
    });
    return NextResponse.json({ agency });
  });
}

/** PATCH /api/agency — toggle demo mode / update workspace settings. */
export async function PATCH(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const input = (await req.json().catch(() => ({}))) as { demoMode?: boolean };
  return withTenantDb(guard.auth.agencyId, async (prisma) => {
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
  });
}