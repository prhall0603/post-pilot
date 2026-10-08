import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// POST /api/posts/bulk-approve — approve all / month / filtered selection
// body: { clientId, month?: "YYYY-MM", platform?: string, status?: string, postIds?: string[] }
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const input = (await req.json().catch(() => ({}))) as {
    clientId?: string;
    month?: string;
    platform?: string;
    status?: string;
    postIds?: string[];
  };
  if (!input.clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, agencyId: guard.auth.agencyId },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const where: Record<string, unknown> = { clientId: input.clientId, status: "DRAFT" };
  if (input.month && /^\d{4}-\d{2}$/.test(input.month)) {
    const [y, m] = input.month.split("-").map(Number);
    where.scheduledDate = { gte: new Date(Date.UTC(y, m - 1, 1)), lte: new Date(Date.UTC(y, m, 0)) };
  }
  if (input.platform) where.platform = input.platform;
  const posts = await prisma.post.findMany({ where: where as never, select: { id: true } });

  let ids = posts.map((p) => p.id);
  if (input.postIds?.length) {
    const allowed = new Set(ids);
    ids = input.postIds.filter((x) => allowed.has(x));
  }
  const res = await prisma.post.updateMany({
    where: { id: { in: ids } },
    data: { status: "APPROVED" },
  });
  return NextResponse.json({ ok: true, approved: res.count });
}