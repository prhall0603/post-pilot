import { db } from "@/lib/tenantDb";
import { withTenantDb } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isPlatformId } from "@/lib/platforms";

interface PlatformInput {
  platform: string;
  cadenceWeekly?: number;
}

interface WizardInput {
  name?: string;
  industry?: string;
  website?: string;
  locationId?: string;
  brandVoice?: string;
  brandVoiceNotes?: string;
  targetAudience?: string;
  serviceArea?: string;
  logoUrl?: string;
  products?: Array<{ name?: string; description?: string }>;
  platforms?: PlatformInput[];
  blackoutDates?: Array<{ date?: string; reason?: string }>;
}

/** POST /api/clients — create a client (Stage 1 wizard submit). */
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    const input = (await req.json().catch(() => ({}))) as WizardInput;

    if (!input.name?.trim()) return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    if (!input.industry?.trim()) return NextResponse.json({ error: "Industry is required" }, { status: 400 });

    const platforms = (input.platforms || []).filter((p) => isPlatformId(p.platform));
    if (platforms.length === 0) {
      return NextResponse.json({ error: "Select at least one platform" }, { status: 400 });
    }

    const client = await db.client.create({
      data: {
        agencyId: guard.auth.agencyId,
        name: input.name.trim(),
        industry: input.industry.trim(),
        website: input.website?.trim() || null,
        locationId: input.locationId?.trim() || null,
        brandVoice: input.brandVoice || "professional",
        brandVoiceNotes: input.brandVoiceNotes?.trim() || null,
        targetAudience: input.targetAudience?.trim() || null,
        serviceArea: input.serviceArea?.trim() || null,
        logoUrl: input.logoUrl?.trim() || null,
        platforms: {
          create: platforms.map((p) => ({
            platform: p.platform,
            cadenceWeekly: Math.max(1, Math.min(7, Math.round(p.cadenceWeekly ?? 3))),
          })),
        },
        products: {
          create: (input.products || [])
            .filter((p) => p.name?.trim())
            .slice(0, 20)
            .map((p) => ({ name: p.name!.trim(), description: p.description?.trim() || "" })),
        },
        blackoutDates: {
          create: (input.blackoutDates || [])
            .filter((b) => b.date)
            .map((b) => ({ date: new Date(b.date as string + "T00:00:00.000Z"), reason: b.reason?.trim() || "Closed" })),
        },
      },
      include: { platforms: true, products: true },
    });
    return NextResponse.json({ ok: true, client });
  });
}

/** GET /api/clients — list with plan status + scheduling health. */
export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    const clients = await db.client.findMany({
      where: { agencyId: guard.auth.agencyId },
      include: {
        platforms: true,
        _count: { select: { posts: true, mediaAssets: true } },
        posts: { select: { status: true, scheduledDate: true, mediaRequired: true, ghlPostId: true, media: { select: { id: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    const shaped = clients.map((c) => {
      const posts = c.posts;
      const counts = {
        draft: posts.filter((p) => p.status === "DRAFT").length,
        approved: posts.filter((p) => p.status === "APPROVED").length,
        scheduled: posts.filter((p) => p.status === "SCHEDULED").length,
        failed: posts.filter((p) => p.status === "FAILED").length,
        posted: posts.filter((p) => p.status === "POSTED").length,
      };
      const missingMedia = posts.filter(
        (p) => p.mediaRequired && ["DRAFT", "APPROVED"].includes(p.status) && !(p.ghlPostId || p.media.length > 0)
      ).length;
      const health =
        counts.failed > 0
          ? "needs-attention"
          : counts.scheduled > 0
            ? "on-track"
            : counts.approved > 0
              ? "ready-to-schedule"
              : c.planStatus === "GENERATED"
                ? "awaiting-approval"
                : "not-generated";
      return {
        id: c.id,
        name: c.name,
        industry: c.industry,
        website: c.website,
        locationId: c.locationId,
        planStatus: c.planStatus,
        platforms: c.platforms.map((p) => ({ platform: p.platform, cadenceWeekly: p.cadenceWeekly })),
        postCounts: counts,
        totalPosts: c._count.posts,
        aiCostEstimated: c.aiCostEstimated,
        health,
        missingMedia,
      };
    });
    return NextResponse.json({ clients: shaped });
  });
}