import { db, withTenantDb } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateMonth } from "@/lib/ai";
import { isPlatformId, type PlatformId } from "@/lib/platforms";

/** POST /api/clients/[id]/posts/[postId]/regenerate — AI-regenerate a single post. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string; postId: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    const { id, postId } = await ctx.params;
    const post = await db.post.findFirst({ where: { id: postId, clientId: id } });
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    if (post.status === "SCHEDULED" || post.status === "POSTED") {
      return NextResponse.json({ error: "Scheduled/posted posts cannot be regenerated" }, { status: 400 });
    }
    const client = await db.client.findUnique({
      where: { id },
      include: {
        platforms: true,
        products: true,
        blackoutDates: true,
        posts: { select: { contentTopic: true }, orderBy: { scheduledDate: "desc" }, take: 40 },
      },
    });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const platforms = client.platforms
      .filter((p): p is typeof p & { platform: PlatformId } => isPlatformId(p.platform))
      .map((p) => ({ platform: p.platform, cadenceWeekly: p.cadenceWeekly }));
    try {
      const result = await generateMonth(
        {
          name: client.name,
          industry: client.industry,
          website: client.website,
          brandVoice: client.brandVoice,
          brandVoiceNotes: client.brandVoiceNotes,
          targetAudience: client.targetAudience,
          serviceArea: client.serviceArea,
          products: client.products.slice(0, 12).map((p) => ({ name: p.name, description: p.description })),
          platforms,
          blackouts: client.blackoutDates.map((b) => b.date.toISOString().slice(0, 10)),
          recentTopics: client.posts.map((p) => p.contentTopic),
        },
        new Date(post.scheduledDate)
      );
      const candidates = result.items.filter((it) => it.platform === post.platform);
      if (!candidates.length) {
        return NextResponse.json({ error: "Generation produced no item for this platform" }, { status: 502 });
      }
      const chosen =
        candidates.find((c) => c.day === post.scheduledDate.getUTCDate()) || candidates[0];
      const tokens = result.tokensUsed;
      const updated = await db.post.update({
        where: { id: postId },
        data: {
          body: chosen.body,
          title: chosen.title ?? post.title,
          hashtags: chosen.hashtags || null,
          imagePrompt: chosen.imagePrompt ?? null,
          videoScript: chosen.videoScript ?? null,
          status: "DRAFT",
          failureReason: null,
          failureDetail: null,
          contentTopic: chosen.title || (chosen.body.split("\n")[0] || "").slice(0, 60) || post.contentTopic,
        },
      });
      await db.client.update({
        where: { id },
        data: {
          aiTokensEstimated: { increment: tokens },
          aiCostEstimated: { increment: (tokens / 1000) * 0.00012 },
        },
      });
      return NextResponse.json({ ok: true, post: updated });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Regeneration failed" },
        { status: 500 }
      );
    }
  });
}