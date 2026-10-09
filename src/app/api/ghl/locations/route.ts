import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listLocations } from "@/lib/ghl";
import { withTenantDb } from "@/lib/tenantDb";

/** GET /api/ghl/locations?search=... — sub-accounts for the wizard dropdown. */
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const search = new URL(req.url).searchParams.get("search") || undefined;
  try {
    // ghl.ts reads its own control-plane connection row; the tenant DB copy
    // mirrors it and is kept in sync by connect flows.
    const locations = await withTenantDb(guard.auth.agencyId, () =>
      listLocations(guard.auth.agencyId, search)
    );
    return NextResponse.json({ locations });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list sub-accounts" },
      { status: 500 }
    );
  }
}