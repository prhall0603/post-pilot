import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/**
 * POST /api/upload/logo?clientId=... — stage a logo upload, save it under
 * /public/uploads, and attach it to the client when clientId is provided.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Logo must be PNG, JPEG, WebP, or SVG" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "Logo exceeds 2MB" }, { status: 413 });
  }

  const clientId = new URL(req.url).searchParams.get("clientId");
  const safeName = (file.name || "logo").replace(/[^\w.\- ]+/g, "_").slice(0, 100);
  const fileName = `logo-${Date.now().toString(36)}-${safeName}`;
  const { writeFile, mkdir } = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "public", "uploads", clientId || "pending");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), buf);
  const url = `/uploads/${clientId || "pending"}/${encodeURIComponent(fileName)}`;

  if (clientId) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, agencyId: guard.auth.agencyId },
    });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    await prisma.client.update({ where: { id: clientId }, data: { logoUrl: url } });
  }
  return NextResponse.json({ ok: true, asset: { url, fileName, sizeBytes: buf.length, mimeType: file.type } });
}