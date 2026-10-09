import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, withTenantDb } from "@/lib/tenantDb";
import { listGhlMedia } from "@/lib/ghl";

/**
 * POST /api/clients/[id]/media/import — pull media from GHL into the library.
 * Lists the location's Social Planner media and creates local assets pointing
 * at the CDN URLs (no re-download needed — GHL URLs are already public).
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    const { id } = await ctx.params;
    const client = await db.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    if (!client.locationId) {
      return NextResponse.json(
        { error: "Link this client to a GHL sub-account first" },
        { status: 400 }
      );
    }
    try {
      const items = await listGhlMedia(guard.auth.agencyId, client.locationId);
      let imported = 0;
      for (const item of items) {
        if (!item.url) continue;
        // Dedupe on ghlMediaId when we've imported this before.
        const existing = await db.mediaAsset.findFirst({
          where: { clientId: id, ghlMediaId: item.id },
        });
        if (existing) continue;
        const kind = /video|reel|mp4/i.test(item.type) ? "video" : "image";
        await db.mediaAsset.create({
          data: {
            clientId: id,
            kind,
            fileName: item.fileName || `ghl-${item.id}`,
            url: item.url,
            ghlUrl: item.url, // already hosted on GHL CDN — push is a no-op later
            ghlMediaId: item.id,
            mimeType: kind === "video" ? "video/mp4" : "image/jpeg",
          },
        });
        imported += 1;
      }
      return NextResponse.json({
        ok: true,
        imported,
        skipped: items.length - imported,
        total: items.length,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to list GHL media" },
        { status: 500 }
      );
    }
  });
}