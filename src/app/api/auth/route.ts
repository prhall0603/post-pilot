import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/crypto";
import { createSession, destroySession, getAuth } from "@/lib/auth";
import { seedDemoAgency } from "@/lib/ghlDemo";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth — action-based auth endpoint (single-agency workspace).
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
    // Demo Mode on by default — seed a worked example so the dashboard is alive.
    await prisma.ghLConnection.create({
      data: { agencyId: agency.id, mode: "DEMO", tokenType: "Agency" },
    });
    await seedDemoAgency(agency.id);
    await createSession(agency.id);
    return NextResponse.json({ ok: true, email: agency.email });
  }

  // login
  const agency = await prisma.agency.findUnique({ where: { email } });
  if (!agency || !verifyPassword(password, agency.passwordHash)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  await createSession(agency.id);
  return NextResponse.json({ ok: true, email: agency.email });
}

/** GET /api/auth — current session + whether first-run registration is open. */
export async function GET() {
  const auth = await getAuth();
  const count = await prisma.agency.count();
  return NextResponse.json({
    authenticated: Boolean(auth),
    email: auth?.email || null,
    demoMode: auth?.demoMode ?? true,
    registrationOpen: count === 0,
  });
}