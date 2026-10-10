// Session authentication — httpOnly cookie + hashed session rows.
// Single-agency workspace: first registration creates the workspace, later
// sign-ups are rejected.

import { sha256, randomToken } from "@/lib/crypto";
import { controlDb } from "@/lib/dbMode";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "pp_session";
const SESSION_DAYS = 30;

export interface AgencyAuth {
  agencyId: string;
  email: string;
  demoMode: boolean;
  dbMode: string;
  onboarded: boolean;
}

/** Create a session for an agency and set the httpOnly cookie. */
export async function createSession(agencyId: string): Promise<void> {
  const prisma = await controlDb();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await prisma.session.create({
    data: { tokenHash: sha256(token), agencyId, expiresAt },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Resolve the current agency from the session cookie; null when signed out. */
export async function getAuth(): Promise<AgencyAuth | null> {
  const prisma = await controlDb();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { agency: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return {
    agencyId: session.agencyId,
    email: session.agency.email,
    demoMode: session.agency.demoMode,
    dbMode: session.agency.dbMode,
    onboarded: session.agency.onboarded,
  };
}

/** Sign out: delete session row + clear cookie. */
export async function destroySession(): Promise<void> {
  const prisma = await controlDb();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.delete({ where: { tokenHash: sha256(token) } }).catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
}

/** Guard for API routes: returns 401 Response when unauthenticated. */
export async function requireAuth(): Promise<{ auth: AgencyAuth } | { response: Response }> {
  const auth = await getAuth();
  if (!auth) {
    return { response: Response.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  return { auth };
}

/** Guard for server pages: throws redirect handled by the caller. */
export async function requirePageAuth(): Promise<AgencyAuth> {
  const auth = await getAuth();
  if (!auth) throw new Error("UNAUTHENTICATED");
  return auth;
}