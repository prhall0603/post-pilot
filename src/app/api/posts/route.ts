import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// GET /api/posts?clientId=...&month=YYYY-MM&platform=&status=
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  const client = await prisma.client.findFirst({
    where: { id: clientId, agencyId: guard.auth.agencyId },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const month = url.searchParams.get("month"); // YYYY-MM
  const platform = url.searchParams.get("platform");
  const status = url.searchParams.get("status");

  const where: Record<string, unknown> = { clientId };
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    where.scheduledDate = { gte: start, lte: end };
  }
  if (platform) where.platform = platform;
  if (status && ["DRAFT", "APPROVED", "SCHEDULED", "FAILED", "POSTED"].includes(status)) {
    where.status = status;
  }
  const posts = await prisma.post.findMany({
    where,
    include: {
      media: { include: { mediaAsset: { select: { id: true, kind: true, url: true, ghlUrl: true, fileName: true, youtubeId: true } } } },
    },
    orderBy: [{ scheduledDate: "asc" }, { time: "asc" }],
  });
  return NextResponse.json({ posts });
}