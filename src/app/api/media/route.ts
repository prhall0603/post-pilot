import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// GET /api/media?clientId=... — media library for a client
export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  const client = await prisma.client.findFirst({
    where: { id: clientId, agencyId: guard.auth.agencyId },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const assets = await prisma.mediaAsset.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ assets });
}

const MAX_BYTES = 200 * 1024 * 1024; // 200MB (videos)

// POST /api/media (multipart: file, clientId, kind) — upload to local media store
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart form-data required" }, { status: 400 });
  const clientId = form.get("clientId") as string | null;
  const file = form.get("file") as File | null;
  const kind = (form.get("kind") as string) || "";
  const youtubeUrl = (form.get("youtubeUrl") as string) || "";
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  const client = await prisma.client.findFirst({
    where: { id: clientId, agencyId: guard.auth.agencyId },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // YouTube link registration (no upload)
  if (youtubeUrl) {
    const m = youtubeUrl.match(/(?:youtu\.be\/|v=)([\w-]{11})/);
    const youtubeId = m ? m[1] : null;
    if (!youtubeId) return NextResponse.json({ error: "Not a valid YouTube link" }, { status: 400 });
    const asset = await prisma.mediaAsset.create({
      data: { clientId, kind: "youtube", url: youtubeUrl, youtubeId, fileName: "YouTube video" },
    });
    return NextResponse.json({ ok: true, asset });
  }

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isVideo && !isImage) {
    return NextResponse.json({ error: "Only images or videos are supported" }, { status: 400 });
  }
  const detectedKind = kind === "video" || kind === "image" ? kind : isVideo ? "video" : "image";
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 200MB)" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const safeName = (file.name || "asset").replace(/[^\w.\- ]+/g, "_").slice(-80);
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "uploads", clientId);
  await fs.mkdir(dir, { recursive: true });
  const unique = `${Date.now()}-${safeName}`;
  await fs.writeFile(path.join(dir, unique), buf);
  const asset = await prisma.mediaAsset.create({
    data: {
      clientId,
      kind: detectedKind,
      fileName: file.name || safeName,
      url: `/uploads/${clientId}/${unique}`,
      mimeType: file.type,
      sizeBytes: buf.length,
    },
  });
  return NextResponse.json({ ok: true, asset });
}

// DELETE /api/media?id=...
export async function DELETE(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const asset = await prisma.mediaAsset.findFirst({
    where: { id, client: { agencyId: guard.auth.agencyId } },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (asset.url?.startsWith("/uploads/")) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.rm(path.join(process.cwd(), asset.url), { force: true }).catch(() => {});
  }
  await prisma.postMedia.deleteMany({ where: { mediaAssetId: id } });
  await prisma.mediaAsset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}