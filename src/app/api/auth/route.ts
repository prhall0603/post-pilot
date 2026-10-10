import { controlDb } from "@/lib/dbMode";
import { verifyPassword, hashPassword } from "@/lib/crypto";
import { createSession, destroySession, getAuth } from "@/lib/auth";
import { withTenantDb } from "@/lib/tenantDb";
import { seedDemoAgency } from "@/lib/ghlDemo";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

/** Specific 503 with the Prisma init reason surfaced for setup UIs. */
function dbUnavailable(e: unknown): NextResponse {
  const raw = e instanceof Error ? e.message : String(e);
  const reason = /Environment variable not found/.test(raw)
    ? "connection string (DATABASE_URL) not configured in this environment"
    : /Can't reach database server|ECONNREFUSED|ENETUNREACH|timed out/i.test(raw)
      ? "database server unreachable from this environment"
      : /authentication failed/i.test(raw)
        ? "database credentials rejected"
        : raw.split("\n")[0].slice(0, 140);
  return NextResponse.json({ error: `Database not connected — ${reason}` }, { status: 503 });
}

/**
 * POST /api/auth — action-based auth endpoint (per-workspace).
 * actions: register (first-run only), login, logout
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    email?: string;
    password?: string;
  };
  const action = body.action || "login";

  if (action === "logout") {
    await destroySession();
    return NextResponse.json({ ok: true });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

 try {
   const prisma = await controlDb();
   if (action === "register") {
     const count = await prisma.agency.count();
      if (count > 0) {
        return NextResponse.json({ error: "Workspace already exists. Sign in instead." }, { status: 409 });
      }
      if (password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }
      const agency = await prisma.agency.create({
        data: { email, passwordHash: hashPassword(password), demoMode: true },
      });
      await prisma.ghLConnection.create({
        data: { agencyId: agency.id, mode: "DEMO", tokenType: "Agency" },
      });
      await withTenantDb(agency.id, () => seedDemoAgency({ id: agency.id, dbMode: "HOSTED" }));
      await createSession(agency.id);
      return NextResponse.json({ ok: true, email: agency.email, needsOnboarding: true });
    }

    // login
    const agency = await prisma.agency.findUnique({ where: { email } });
    if (!agency || !verifyPassword(password, agency.passwordHash)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    await createSession(agency.id);
    return NextResponse.json({ ok: true, email: agency.email, needsOnboarding: !agency.onboarded });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientInitializationError) return dbUnavailable(e);
    throw e;
  }
}

/** GET /api/auth — current session + whether onboarding is pending. */
export async function GET() {
  try {
    const auth = await getAuth();
    const prisma = await controlDb();
    const count = await prisma.agency.count();
    return NextResponse.json({
      authenticated: Boolean(auth),
      email: auth?.email || null,
      demoMode: auth?.demoMode ?? true,
      dbMode: auth?.dbMode ?? "HOSTED",
      needsOnboarding: auth ? !auth.onboarded : false,
      registrationOpen: count === 0,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientInitializationError) return dbUnavailable(e);
    throw e;
  }
}