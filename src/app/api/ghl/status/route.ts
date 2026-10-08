import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ghlConfigured } from "@/lib/ghl";
import { MAX_CONCURRENT } from "@/lib/rateLimiter";

// GET /api/ghl/status — connection status, refresh log, rate-limit dashboard.
export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const conn = await prisma.ghLConnection.findUnique({
    where: { agencyId: guard.auth.agencyId },
  });
  const events = await prisma.tokenEvent.findMany({
    where: { agencyId: guard.auth.agencyId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const limiter = globalThis as unknown as {
    ppActive?: number;
    ppWaiters?: Array<{ path: string }>;
  };
  return NextResponse.json({
    configured: ghlConfigured(),
    connected: Boolean(conn),
    mode: conn?.mode || null,
    connectedAt: conn?.connectedAt || null,
    tokenType: conn?.tokenType || null,
    expiresAt: conn?.expiresAt || null,
    lastRefreshedAt: conn?.lastRefreshedAt || null,
    lastError: conn?.lastError || null,
    refreshLogs: events.map((e) => ({ id: e.id, kind: e.kind, detail: e.detail, createdAt: e.createdAt })),
    rateLimit: {
      maxConcurrent: MAX_CONCURRENT,
      active: limiter.ppActive || 0,
      queued: limiter.ppWaiters?.length || 0,
    },
  });
}