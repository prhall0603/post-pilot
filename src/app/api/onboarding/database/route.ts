import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { controlDb } from "@/lib/dbMode";
import { encrypt, decrypt } from "@/lib/crypto";
import { installClientSchema } from "@/lib/schemaInstaller";
import { withTenantDb, evictTenantClient } from "@/lib/tenantDb";
import { seedDemoByoWorkspace } from "@/lib/onboarding";

/**
 * POST /api/onboarding/database — point this workspace at its own Supabase
 * project (BYO) or revert to the HOSTED database. Validates the connection
 * (SELECT 1), installs the PostPilot schema, migrates a registry summary, and
 * seeds the worked example so nothing looks broken after the switch.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;
  const agencyId = guard.auth.agencyId;
  const prisma = await controlDb();
  const input = (await req.json().catch(() => ({}))) as { mode?: string; dbUrl?: string; label?: string };

  if (input.mode === "HOSTED") {
    // Revert to hosted; keep stored BYO creds but stop using them.
    await prisma.agency.update({
      where: { id: agencyId },
      data: { dbMode: "HOSTED" },
    });
    evictTenantClient(agencyId);
    return NextResponse.json({ ok: true, dbMode: "HOSTED" });
  }

  if (input.mode !== "BYO") {
    return NextResponse.json({ error: "mode must be HOSTED or BYO" }, { status: 400 });
  }

  let dbUrl = (input.dbUrl || "").trim();
  let label = (input.label || "").trim() || null;

  // Support "no change" reconnects (e.g. password rotation): reuse stored creds
  if (!dbUrl) {
    const current = await prisma.agency.findUnique({ where: { id: agencyId } });
    const stored = current?.dbUrlEnc ? decrypt(current.dbUrlEnc) : null;
    if (!stored) return NextResponse.json({ error: "A Supabase connection string is required" }, { status: 400 });
    dbUrl = stored;
  }

  const parsed = new URL(dbUrl);
  if (!/supabase\.co|supabase\.com|supabase\.red$/i.test(parsed.hostname)) {
    return NextResponse.json(
      { error: "That host is not a Supabase database. Expected *.supabase.co / *.pooler.supabase.com." },
      { status: 400 }
    );
  }
  if (!parsed.password) {
    return NextResponse.json({ error: "The connection string is missing its password" }, { status: 400 });
  }
  // Rewrite direct (IPv6-only) hosts to the working pooler discovered at probe time.
  const poolerRegion = process.env.PP_POOLER_REGION || "us-east-1";
  const projectRef = parsed.hostname.replace(/^db\./, "").split(".")[0];
  if (/^db\./i.test(parsed.hostname)) {
    parsed.username = `postgres.${projectRef}`;
    parsed.hostname = `aws-0-${poolerRegion}.pooler.supabase.com`;
  }
  const finalUrl = parsed.toString();

  // Probe: real SELECT 1 before committing anything.
  const { PrismaClient } = await import("@prisma/client");
  const probe = new PrismaClient({ datasources: { db: { url: finalUrl } }, log: [] });
  try {
    await probe.$queryRaw`SELECT 1`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/authentication failed|credentials/i.test(msg)) {
      return NextResponse.json(
        { error: "Supabase rejected the credentials — the database password in the connection string is not valid" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: `Could not connect to the database: ${msg.slice(0, 160)}` }, { status: 400 });
  } finally {
    await probe.$disconnect().catch(() => {});
  }

  // Install the schema in the tenant database.
  try {
    await installClientSchema(finalUrl);
  } catch (e) {
    return NextResponse.json(
      { error: `Connected, but the schema could not be installed: ${e instanceof Error ? e.message.slice(0, 160) : "unknown error"}` },
      { status: 400 }
    );
  }

  // Commit: encrypted connection string + registry summary row in the tenant.
  await prisma.agency.update({
    where: { id: agencyId },
    data: { dbMode: "BYO", dbUrlEnc: encrypt(finalUrl), dbLabel: label || parsed.hostname },
  });
  evictTenantClient(agencyId);
  await withTenantDb(agencyId, () => seedDemoByoWorkspace(agencyId, guard.auth.email, label || parsed.hostname));

  return NextResponse.json({ ok: true, dbMode: "BYO", label: label || parsed.hostname });
}