import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

/**
 * POST /api/clients/[id]/approve — bulk approve.
 * body: { scope: "all" | "month" | "filtered", month?: "YYYY-MM",
 *         platform?, status?, postIds?: string[] }
 * Drafts containing [PLACEHOLDER] tokens are flagged but NOT blocked — the UI
 * surfaces them so reviewers can replace before scheduling.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const client = await prisma.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const input = (await req.json().catch(() => ({}))) as {
    scope?: "all" | "month" | "filtered" | "posts";
    month?: string;
    platform?: string;
    status?: string;
    postIds?: string[];
  };

  const where: Record<string, unknown> = { clientId: id, status: { in: ["DRAFT", "APPROVED"] } };
  if (input.scope === "posts" && input.postIds?.length) {
    where.id = { in: input.postIds };
  } else {
    if (input.scope === "month" && input.month) {
      const [y, m] = input.month.split("-").map(Number);
      where.scheduledDate = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
    }
    if (input.platform) where.platform = input.platform;
    if (input.status && input.status.toUpperCase() !== "ALL") where.status = input.status.toUpperCase();
  }

  const res = await prisma.post.updateMany({ where, data: { status: "APPROVED" } });
  return NextResponse.json({ ok: true, approved: res.count });
}