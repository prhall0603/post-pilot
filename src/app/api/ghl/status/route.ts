import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, withTenantDb } from "@/lib/tenantDb";
import { ghlConfigured } from "@/lib/ghl";
import { aiMode } from "@/lib/ai";
import { limiterStats } from "@/lib/rateLimiter";

/**
 * GET /api/ghl/status — connection status (from the workspace's tenant DB) +
 * configuration readiness.
 */
export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    const conn = await db.ghLConnection.findUnique({
      where: { agencyId: guard.auth.agencyId },
    });
    const events = await db.tokenEvent.findMany({
      where: { agencyId: guard.auth.agencyId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json({
      connected: Boolean(conn?.connectedAt || conn?.mode),
      mode: conn?.mode || null,
      configured: ghlConfigured(),
      aiMode: aiMode(),
      scope: conn?.scope || null,
      connectedAt: conn?.connectedAt || null,
      lastRefreshedAt: conn?.lastRefreshedAt || null,
      expiresAt: conn?.expiresAt || null,
      lastError: conn?.lastError || null,
      tokenType: conn?.tokenType || null,
      events,
      limiter: limiterStats(),
    });
  });
}