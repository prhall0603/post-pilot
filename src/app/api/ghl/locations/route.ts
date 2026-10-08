import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listLocations } from "@/lib/ghl";

// GET /api/ghl/locations?search=... — agency sub-accounts for the dropdown.
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const search = new URL(req.url).searchParams.get("search") || undefined;
  try {
    const locations = await listLocations(guard.auth.agencyId, search);
    return NextResponse.json({ locations });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list locations" },
      { status: 500 }
    );
  }
}