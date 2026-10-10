import { controlDb, isLocalMode } from "@/lib/dbMode";
import { verifyPassword, hashPassword } from "@/lib/crypto";
import { createSession, destroySession, getAuth } from "@/lib/auth";
import { withTenantDb } from "@/lib/tenantDb";
import { seedDemoAgency } from "@/lib/ghlDemo";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

/** Specific 503 with the real reason surfaced for setup UIs. */
function dbUnavailable(e: unknown): NextResponse {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  let reason = raw.replace(/^[^:]*:\s*/, "").split("\n")[0].slice(0, 220);
  if (/Environment variable not found/.test(raw)) {
    reason = "no database connection string (DATABASE_URL) is configured";
  } else if (/Cannot reach database server|ECONNREFUSED|ENETUNREACH|timed out/i.test(raw)) {
    reason = "database server unreachable";
  } else if (/authentication failed|credentials/i.test(raw)) {
    reason = "database credentials rejected";
  } else if (/restart to load the newly installed/i.test(raw)) {
    reason =
      "Local Mode database was prepared during install - restart the app (Ctrl+C, run the launcher again) and it will be ready";
  } else if (/LOCAL DB NOT PREPARED|Local database client not prepared|not initialized/i.test(raw)) {
    reason =
      "Local Mode database is not prepared - run the installer again (START-APP.bat / .command / .sh or install.sh)";
  }
  return NextResponse.json({ error: `Database issue - ${reason}` }, { status: 503 });
}

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

    const agency = await prisma.agency.findUnique({ where: { email } });
    if (!agency || !verifyPassword(password, agency.passwordHash)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    await createSession(agency.id);
    return NextResponse.json({ ok: true, email: agency.email, needsOnboarding: !agency.onboarded });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientInitializationError) return dbUnavailable(e);
    if (e instanceof Error && (isLocalMode() || /Local database|Local Mode|not prepared/i.test(e.message))) {
      return dbUnavailable(e);
    }
    throw e;
  }
}

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
    if (e instanceof Error && (isLocalMode() || /Local database|Local Mode|not prepared/i.test(e.message))) {
      return dbUnavailable(e);
    }
    throw e;
  }
}
