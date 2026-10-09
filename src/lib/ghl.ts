// GoHighLevel API client — agency-level marketplace-app OAuth.
//  - LIVE: real OAuth against services.leadconnectorhq.com
//  - DEMO: simulated tokens/endpoints (see ghlDemo.ts) so everything is
//    testable before marketplace credentials exist.
//
// Per-location context: Social Planner endpoints are location-scoped. Every
// location-scoped call first resolves a location token via
// GET /oauth/replyUser?locationId={locationId} using the agency token —
// never the raw agency token itself.

import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { acquire, backoffFor, sleep, noteRateLimited } from "@/lib/rateLimiter";

const GHL_BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

// Scopes required for PostPilot: sub-account discovery + social planner.
// NOTE: exact scope names and endpoint paths shift between GHL API versions —
// re-verify against the current GHL API docs when enabling LIVE mode.
export const GHL_SCOPES =
  "locations.readonly socialplanning.get socialplanning.post users.readonly";

export function ghlConfigured(): boolean {
  return Boolean(process.env.GHL_CLIENT_ID && process.env.GHL_CLIENT_SECRET);
}

export function ghlRedirectUri(origin: string): string {
  return process.env.GHL_REDIRECT_URI || new URL("/api/ghl/callback", origin).href;
}

export function ghlAuthorizeUrl(origin: string): string {
  return (
    `https://marketplace.gohighlevel.com/oauth/authorize` +
    `?client_id=${encodeURIComponent(process.env.GHL_CLIENT_ID || "")}` +
    `&redirect_uri=${encodeURIComponent(ghlRedirectUri(origin))}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(GHL_SCOPES)}`
  );
}

async function getConn(agencyId: string) {
  const conn = await prisma.ghLConnection.findUnique({ where: { agencyId } });
  if (!conn) throw new Error("GHL not connected");
  return conn;
}

/** Current connection mode for an agency ("DEMO" | "PIT" | "LIVE" | null unconnected). */
export async function getConnectionMode(agencyId: string): Promise<"DEMO" | "PIT" | "LIVE" | null> {
  const conn = await prisma.ghLConnection.findUnique({
    where: { agencyId },
    select: { mode: true },
  });
  return (conn?.mode as "DEMO" | "PIT" | "LIVE" | null) ?? null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/** Exchange authorization code for agency tokens (LIVE mode). */
export async function exchangeCode(
  agencyId: string,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<void> {
  const res = await fetch(`${GHL_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      user_type: "Company",
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(`GHL token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
    locationId?: string;
    userId?: string;
  };
  // Refresh Token Rol: Agency — the token acts on every sub-account under it.
  const payload = decodeJwtPayload(tok.access_token);
  await prisma.ghLConnection.update({
    where: { agencyId },
    data: {
      mode: "LIVE",
      clientId,
      accessTokenEnc: encrypt(tok.access_token),
      refreshTokenEnc: encrypt(tok.refresh_token),
      tokenType: tok.token_type || "Agency",
      expiresAt: new Date(Date.now() + Math.max(60, tok.expires_in - 60) * 1000),
      scope: tok.scope || null,
      locationId: tok.locationId ?? (payload?.locationId as string) ?? null,
      userId: tok.userId ?? (payload?.userId as string) ?? null,
      lastRefreshedAt: new Date(),
      lastError: null,
      connectedAt: new Date(),
    },
  });
  await prisma.tokenEvent.create({
    data: { agencyId, kind: "connect", detail: "Agency OAuth connected (LIVE)" },
  });
}

/** Refresh the agency token (LIVE mode); logs a TokenEvent either way. */
export async function refreshAgencyToken(agencyId: string): Promise<void> {
  const conn = await getConn(agencyId);
  if (conn.mode !== "LIVE") return; // demo tokens never expire
  const refreshToken = decrypt(conn.refreshTokenEnc);
  if (!refreshToken) throw new Error("No refresh token stored");
  try {
    const res = await fetch(`${GHL_BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: conn.clientId || process.env.GHL_CLIENT_ID || "",
        client_secret: decrypt(conn.clientSecretEnc) || process.env.GHL_CLIENT_SECRET || "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        user_type: "Company",
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const tok = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope?: string;
    };
    await prisma.ghLConnection.update({
      where: { agencyId },
      data: {
        accessTokenEnc: encrypt(tok.access_token),
        refreshTokenEnc: encrypt(tok.refresh_token),
        expiresAt: new Date(Date.now() + Math.max(60, tok.expires_in - 60) * 1000),
        scope: tok.scope || conn.scope,
        lastRefreshedAt: new Date(),
        lastError: null,
      },
    });
    await prisma.tokenEvent.create({
      data: { agencyId, kind: "refresh", detail: "Agency token refreshed" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.ghLConnection.update({ where: { agencyId }, data: { lastError: msg } });
    await prisma.tokenEvent.create({ data: { agencyId, kind: "refresh_error", detail: msg } });
    throw e;
  }
}

interface LocationTokenCache {
  token: string;
  expiresAt: number;
}
const g = globalThis as unknown as { __ppLocTokens?: Map<string, LocationTokenCache> };
if (!g.__ppLocTokens) g.__ppLocTokens = new Map();

/**
 * Location-scoped access token. LIVE: GET /oauth/replyUser?locationId with the
 * (fresh) agency token. DEMO: derived deterministic token. Cached until
 * shortly before expiry.
 */
export async function getLocationToken(agencyId: string, locationId: string): Promise<string> {
  const cacheKey = `${agencyId}:${locationId}`;
  const cached = g.__ppLocTokens!.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const conn = await getConn(agencyId);
  if (conn.mode === "DEMO") {
    const token = `demo-location-token-${locationId}`;
    g.__ppLocTokens!.set(cacheKey, { token, expiresAt: Date.now() + 3600_000 });
    return token;
  }
  if (conn.mode === "PIT") {
    // Private Integration tokens act directly on the locations the token
    // covers — used as a plain Bearer token for location-scoped endpoints.
    const token = decrypt(conn.accessTokenEnc) || "";
    if (!token) throw new Error("PIT token missing — reconnect the Private Integration");
    g.__ppLocTokens!.set(cacheKey, { token, expiresAt: Date.now() + 3600_000 });
    return token;
  }

  let agencyToken = decrypt(conn.accessTokenEnc) || "";
  if (!agencyToken || (conn.expiresAt && conn.expiresAt < new Date(Date.now() + 60_000))) {
    await refreshAgencyToken(agencyId);
    agencyToken = decrypt((await getConn(agencyId)).accessTokenEnc) || "";
  }

  const res = await fetch(
    `${GHL_BASE}/oauth/replyUser?locationId=${encodeURIComponent(locationId)}`,
    { headers: { Authorization: `Bearer ${agencyToken}`, Version: VERSION, Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`oauth/replyUser failed: ${res.status}`);
  const tok = (await res.json()) as { access_token: string; expires_in?: number };
  g.__ppLocTokens!.set(cacheKey, {
    token: tok.access_token,
    expiresAt: Date.now() + Math.max(60, (tok.expires_in || 3600) - 30) * 1000,
  });
  return tok.access_token;
}

export class GhlApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`GHL API ${status}: ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

async function ghlFetch(
  agencyId: string,
  locationId: string,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown }
): Promise<unknown> {
  const release = await acquire(locationId || "agency");
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await getLocationToken(agencyId, locationId || "agency");
      const res = await fetch(`${GHL_BASE}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${token}`,
          Version: VERSION,
          Accept: "application/json",
          ...(init.method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(init.method === "POST" ? { body: JSON.stringify(init.body) } : {}),
      });
      if (res.status === 429) {
        noteRateLimited();
        await sleep(backoffFor(attempt));
        continue;
      }
      if (res.status === 401) {
        g.__ppLocTokens!.delete(`${agencyId}:${locationId}`);
        await refreshAgencyToken(agencyId).catch(() => {});
        continue;
      }
      if (!res.ok) throw new GhlApiError(res.status, (await res.text()).slice(0, 400));
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    }
    throw new GhlApiError(429, "Rate limited after retries");
  } finally {
    release();
  }
}

/** Location-scoped GET with global concurrency limit, per-location queue, backoff. */
export async function ghlLocationGet(agencyId: string, locationId: string, path: string): Promise<unknown> {
  return ghlFetch(agencyId, locationId, path, { method: "GET" });
}

/** Location-scoped POST for scheduling + media uploads. */
export async function ghlLocationPost(
  agencyId: string,
  locationId: string,
  path: string,
  body: unknown
): Promise<unknown> {
  return ghlFetch(agencyId, locationId, path, { method: "POST", body });
}

/** GET /locations/search — list sub-accounts under the agency. */
export async function listLocations(
  agencyId: string,
  search?: string
): Promise<Array<{ id: string; name: string; address?: string; logoUrl?: string }>> {
  const conn = await getConn(agencyId);
  if (conn.mode === "DEMO") {
    const { DEMO_LOCATIONS } = await import("@/lib/ghlDemo");
    const q = (search || "").toLowerCase();
    return DEMO_LOCATIONS.filter((l) => !q || l.name.toLowerCase().includes(q) || l.id.includes(q));
  }
  if (conn.mode === "PIT") {
    // With a Private Integration token, locations/search runs directly with it.
    const pit = decrypt(conn.accessTokenEnc) || "";
    const release = await acquire("agency");
    try {
      const q = search ? `&search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`${GHL_BASE}/locations/search?limit=100${q}`, {
        headers: { Authorization: `Bearer ${pit}`, Version: VERSION, Accept: "application/json" },
      });
      if (!res.ok) throw new GhlApiError(res.status, (await res.text()).slice(0, 300));
      const data = (await res.json()) as {
        locations?: Array<{ id: string; name: string; address?: string; logoUrl?: string }>;
      };
      return data.locations || [];
    } finally {
      release();
    }
  }
  const release = await acquire("agency");
  try {
    let token = decrypt(conn.accessTokenEnc) || "";
    if (!token || (conn.expiresAt && conn.expiresAt < new Date(Date.now() + 60_000))) {
      await refreshAgencyToken(agencyId);
      token = decrypt((await getConn(agencyId)).accessTokenEnc) || "";
    }
    const q = search ? `&search=${encodeURIComponent(search)}` : "";
    const res = await fetch(`${GHL_BASE}/locations/search?limit=100${q}`, {
      headers: { Authorization: `Bearer ${token}`, Version: VERSION, Accept: "application/json" },
    });
    if (res.status === 401) {
      await refreshAgencyToken(agencyId);
      token = decrypt((await getConn(agencyId)).accessTokenEnc) || "";
    }
    if (!res.ok) throw new GhlApiError(res.status, (await res.text()).slice(0, 400));
    const data = (await res.json()) as {
      locations?: Array<{ id: string; name: string; address?: string; logoUrl?: string }>;
    };
    return data.locations || [];
  } finally {
    release();
  }
}

/** GET /social-media-posting/{locationId}/accounts — connected account targets. */
export async function listAccounts(
  agencyId: string,
  locationId: string
): Promise<Array<{ id: string; name: string; platform: string; avatarUrl?: string }>> {
  const conn = await getConn(agencyId);
  if (conn.mode === "DEMO") {
    const { demoAccountsFor } = await import("@/lib/ghlDemo");
    return demoAccountsFor(locationId);
  }
  const data = (await ghlLocationGet(agencyId, locationId, `/social-media-posting/${locationId}/accounts`)) as {
    accounts?: Array<Record<string, unknown>>;
  };
  return (data.accounts || []).map((a) => ({
    id: String(a.id),
    name: String((a as { name?: string }).name || "Account"),
    platform: String((a as { platform?: string }).platform || "unknown"),
    avatarUrl: (a as { avatarUrl?: string }).avatarUrl as string | undefined,
  }));
}

export interface GhlPostPayload {
  platform: string;
  locationId?: string;
  accountId?: string;
  body: string;
  mediaUrls: string[];
  scheduledAt: string;
  title?: string;
  gbpPostType?: string;
  isThread?: boolean;
  threadItems?: string[];
}

/** POST /social-media-posting/{locationId}/posts — schedule a post. */
export async function createGhlPost(
  agencyId: string,
  locationId: string,
  payload: GhlPostPayload
): Promise<{ id: string }> {
  const conn = await getConn(agencyId);
  if (conn.mode === "DEMO") {
    const { demoCreatePost } = await import("@/lib/ghlDemo");
    return demoCreatePost(locationId, payload);
  }
  const item: Record<string, unknown> = {
    accountId: payload.accountId,
    platform: payload.platform,
    body: payload.body,
    mediaUrls: payload.mediaUrls,
    scheduledAt: payload.scheduledAt,
    status: "to-be-confirmed",
  };
  if (payload.title) item.title = payload.title;
  if (payload.gbpPostType) item.gbpPostType = payload.gbpPostType;
  if (payload.isThread) {
    item.isThread = true;
    item.threadItems = payload.threadItems || [payload.body];
  }
  const result = (await ghlLocationPost(agencyId, locationId, `/social-media-posting/${locationId}/posts`, {
    posts: [item],
  })) as { id?: string; succeeded?: Array<{ id: string }> };
  const id = result.id || result.succeeded?.[0]?.id;
  if (!id) throw new GhlApiError(500, "No post id returned by GHL");
  return { id };
}

/** GHL CDN media upload — returns the CDN URL used by scheduled posts. */
export async function uploadToGhlCdn(
  agencyId: string,
  locationId: string,
  fileName: string,
  contentType: string,
  data: Buffer
): Promise<{ url: string; mediaId: string }> {
  const conn = await getConn(agencyId);
  if (conn.mode === "DEMO") {
    const { demoUploadMedia } = await import("@/lib/ghlDemo");
    return demoUploadMedia(fileName);
  }
  const { id: mediaId, signedUrl } = (await ghlLocationPost(
    agencyId,
    locationId,
    `/social-media-posting/${locationId}/upload`,
    { fileName, contentType }
  )) as { id: string; signedUrl?: string };
  if (signedUrl) {
    const put = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: new Uint8Array(data),
    });
    if (!put.ok) throw new Error(`GHL CDN upload failed: ${put.status}`);
  }
  return {
    url: `${GHL_BASE}/social-media-posting/${locationId}/media/${mediaId}`,
    mediaId,
  };
}

/**
 * Validate a Private Integration token by hitting locations/search.
 * Returns the first visible location on success (proof the token works).
 */
export async function validatePitToken(
  token: string
): Promise<{ ok: true; sampleLocation?: { id: string; name: string } } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${GHL_BASE}/locations/search?limit=1`, {
      headers: { Authorization: `Bearer ${token}`, Version: VERSION, Accept: "application/json" },
    });
    if (res.status === 401) {
      return { ok: false, error: "Token rejected by GHL — check that it was copied in full and is active" };
    }
    if (!res.ok) {
      return { ok: false, error: `GHL returned ${res.status} for the token — it may lack the required scopes/permissions` };
    }
    const data = (await res.json()) as { locations?: Array<{ id: string; name: string }> };
    const first = data.locations?.[0];
    if (!first) {
      return { ok: false, error: "Token works but sees no sub-accounts — grant it access to the client's location" };
    }
    return { ok: true, sampleLocation: { id: first.id, name: first.name } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach GHL to validate the token" };
  }
}

/** Store a validated PIT connection (encrypted at rest). */
export async function connectPit(agencyId: string, token: string, sample?: { id: string; name: string }): Promise<void> {
  await prisma.ghLConnection.upsert({
    where: { agencyId },
    create: {
      agencyId,
      mode: "PIT",
      accessTokenEnc: encrypt(token),
      tokenType: "PrivateIntegration",
      connectedAt: new Date(),
      lastError: null,
      locationId: sample?.id ?? null,
    },
    update: {
      mode: "PIT",
      accessTokenEnc: encrypt(token),
      refreshTokenEnc: null,
      tokenType: "PrivateIntegration",
      connectedAt: new Date(),
      lastError: null,
      lastRefreshedAt: null,
      expiresAt: null,
      locationId: sample?.id ?? null,
    },
  });
  await prisma.tokenEvent.create({
    data: { agencyId, kind: "connect", detail: `Private Integration connected${sample ? ` — sees ${sample.name}` : ""}` },
  });
}