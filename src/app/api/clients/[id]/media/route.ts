import { db, withTenantDb } from "@/lib/tenantDb";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ensureGhlMedia } from "@/lib/scheduler";

/** GET /api/clients/[id]/media — the media library for a client. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    const { id } = await ctx.params;
    const client = await db.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const assets = await db.mediaAsset.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ assets });
  });
}

/**
 * POST /api/clients/[id]/media — add a media asset.
 * JSON body: { youtubeUrl } or multipart form with a file.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    const { id } = await ctx.params;
    const client = await db.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const contentTypeHeader = req.headers.get("content-type") || "";

    // YouTube link path (JSON)
    if (contentTypeHeader.includes("application/json")) {
      const input = (await req.json().catch(() => ({}))) as { youtubeUrl?: string };
      const raw = (input.youtubeUrl || "").trim();
      const m = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
      if (!m) return NextResponse.json({ error: "Enter a valid YouTube link" }, { status: 400 });
      const asset = await db.mediaAsset.create({
        data: {
          clientId: id,
          kind: "youtube",
          url: `https://www.youtube.com/watch?v=${m[1]}`,
          youtubeId: m[1],
          fileName: `youtube-${m[1]}`,
          mimeType: "video/youtube",
        },
      });
      return NextResponse.json({ ok: true, asset });
    }

    // File upload path (multipart)
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      return NextResponse.json({ error: "Only image and video files are supported" }, { status: 400 });
    }
    const MAX = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX) {
      return NextResponse.json(
        { error: `${isVideo ? "Video" : "Image"} exceeds ${isVideo ? 100 : 10}MB limit` },
        { status: 413 }
      );
    }
    const safeName = (file.name || "upload").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    const fileName = `${client.id.slice(0, 8)}-${Date.now().toString(36)}-${safeName}`;
    const { writeFile, mkdir } = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "public", "uploads", id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, fileName), buf);

    const asset = await db.mediaAsset.create({
      data: {
        clientId: id,
        kind: isVideo ? "video" : "image",
        fileName: safeName,
        url: `/uploads/${id}/${encodeURIComponent(fileName)}`,
        mimeType: file.type,
        sizeBytes: buf.length,
      },
    });

    // Auto-push to GHL CDN right away (best-effort): scheduling later becomes
    // instant and the asset shows as ready. Failure is non-fatal — the retry
    // button and the scheduling pipeline both push on demand.
    let pushError: string | null = null;
    if (client.locationId) {
      try {
        const cdn = await ensureGhlMedia(guard.auth.agencyId, client.locationId, asset);
        const fresh = await db.mediaAsset.findUnique({ where: { id: asset.id } });
        return NextResponse.json({ ok: true, asset: fresh, autoPushed: Boolean(cdn) });
      } catch (e) {
        pushError = e instanceof Error ? e.message.slice(0, 160) : "GHL upload failed";
      }
    }
    return NextResponse.json({ ok: true, asset, autoPushed: false, pushError });
  });
}

/** DELETE /api/clients/[id]/media?assetId=... — detach everywhere + delete. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    const { id } = await ctx.params;
    const assetId = new URL(req.url).searchParams.get("assetId");
    if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });
    const asset = await db.mediaAsset.findFirst({ where: { id: assetId, clientId: id } });
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    await db.mediaAsset.delete({ where: { id: assetId } });
    return NextResponse.json({ ok: true });
  });
}

/** PATCH /api/clients/[id]/media — push an asset to GHL CDN now (pre-warm). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  return withTenantDb(guard.auth.agencyId, async () => {
    const { id } = await ctx.params;
    const input = (await req.json().catch(() => ({}))) as { assetId?: string };
    if (!input.assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });
    const client = await db.client.findFirst({ where: { id, agencyId: guard.auth.agencyId } });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const asset = await db.mediaAsset.findFirst({ where: { id: input.assetId, clientId: id } });
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    if (!client.locationId) {
      return NextResponse.json({ error: "Link this client to a GHL sub-account first" }, { status: 400 });
    }
    try {
      const url = await ensureGhlMedia(guard.auth.agencyId, client.locationId, asset);
      const fresh = await db.mediaAsset.findUnique({ where: { id: asset.id } });
      return NextResponse.json({ ok: true, ghlUrl: url, asset: fresh });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "GHL CDN upload failed" },
        { status: 500 }
      );
    }
  });
}