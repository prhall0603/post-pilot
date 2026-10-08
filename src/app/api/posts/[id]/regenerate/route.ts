import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { generateMonth } from "@/lib/ai";
import { trimForPlatform, PLATFORM_RULES, type PlatformId } from "@/lib/platforms";

// POST /api/posts/[id]/regenerate — AI-regenerate a single post in place.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const { id } = await ctx.params;
  const post = await prisma.post.findFirst({
    where: { id, client: { agencyId: guard.auth.agencyId } },
    include: { client: { include: { products: true } } },
  });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (!isPlatformId(post.platform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  }
  try {
    const result = await generateMonth(
      {
        name: post.client.name,
        industry: post.client.industry,
        website: post.client.website,
        brandVoice: post.client.brandVoice,
        brandVoiceNotes: post.client.brandVoiceNotes,
        targetAudience: post.client.targetAudience,
        serviceArea: post.client.serviceArea,
        products: post.client.products.map((p) => ({ name: p.name, description: p.description })),
        platforms: [{ platform: post.platform as PlatformId, cadenceWeekly: 1 }],
        blackouts: [],
        recentTopics: [post.contentTopic],
      },
      post.scheduledDate
    );
    const rules = PLATFORM_RULES[post.platform as PlatformId];
    const pick =
      result.items.find((it) => it.category === post.category) || result.items[0];
    if (!pick) return NextResponse.json({ error: "No content generated" }, { status: 500 });
    const updated = await prisma.post.update({
      where: { id },
      data: {
        body: trimForPlatform(post.platform, pick.body),
        hashtags: rules.noHashtagEmphasis ? null : pick.hashtags || post.hashtags,
        imagePrompt: pick.imagePrompt ?? post.imagePrompt,
        videoScript: pick.videoScript ?? post.videoScript,
        title: post.platform === "youtube" ? pick.title || post.title : post.title,
      },
    });
    return NextResponse.json({ ok: true, post: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Regeneration failed" },
      { status: 500 }
    );
  }
}