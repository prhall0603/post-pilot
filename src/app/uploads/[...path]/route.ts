import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";

// Serves uploaded media from ./uploads/{clientId}/... for signed-in agencies.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const auth = await getAuth();
  if (!auth) return new Response("Unauthorized", { status: 401 });
  const { path } = await ctx.params;
  if (!path || path.length !== 2) return new Response("Not found", { status: 404 });
  const [clientId, fileName] = path;
  const client = await prisma.client.findFirst({
    where: { id: clientId, agencyId: auth.agencyId },
  });
  if (!client) return new Response("Not found", { status: 404 });
  const safe = fileName.replace(/[^\w.\- ]+/g, "");
  const fs = await import("node:fs/promises");
  const pathMod = await import("node:path");
  const filePath = pathMod.join(process.cwd(), "uploads", clientId, safe);
  try {
    const data = await fs.readFile(filePath);
    const ext = safe.split(".").pop()?.toLowerCase() || "";
    const types: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
    };
    const body = new Uint8Array(data);
    return new Response(body, {
      headers: {
        "Content-Type": types[ext] || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}