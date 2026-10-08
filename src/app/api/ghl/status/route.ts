import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ghlConfigured } from "@/lib/ghl";
import { aiMode } from "@/lib/ai";
import { limiterStats } from "@/lib/rateLimiter";

/**
 * GET /api/ghl/status — connection status + configuration readiness.
 * Shows the agent which mode the integration will run in and whether env
 * credentials are present.
 */
export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const conn = await prisma.ghLConnection.findUnique({
    where: { agencyId: guard.auth.agencyId },
  });
  const events = await prisma.tokenEvent.findMany({
    where: { agencyId: guard.auth.agencyId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({
    connected: Boolean(conn?.connectedAt || conn?.mode),
    mode: conn?.mode || null,
    configured: ghlConfigured(), // true when GHL_CLIENT_ID/SECRET are in env
    aiMode: aiMode(), // "ai" with Ollama configured, "demo" without
    scope: conn?.scope || null,
    connectedAt: conn?.connectedAt || null,
    lastRefreshedAt: conn?.lastRefreshedAt || null,
    expiresAt: conn?.expiresAt || null,
    lastError: conn?.lastError || null,
    tokenType: conn?.tokenType || null,
    events,
    limiter: limiterStats(),
  });
}