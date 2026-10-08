import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { acquire, backoffFor, sleep } from "@/lib/rateLimiter";

// GoHighLevel API client — agency-level OAuth. Two modes:
//  - LIVE: real marketplace-app OAuth against services.leadconnectorhq.com
//  - DEMO: fully simulated tokens/endpoints so the whole flow is testable
//    before marketplace credentials exist.

const GHL_BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

export const GHL_SCOPES =
  "locations.readonly socialplanning.get socialplanning.post users.readonly";

export function isLive(): boolean {
  const conn = globalThis as unknown as { __ppGhlMode?: "LIVE" | "DEMO" };
  return conn.__ppGhlMode === "LIVE";
}

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
    `&response_type=code&scope=${encodeURIComponent(GHL_SCOPES)}`
  );
}

async function getConn(agencyId: string) {
  const conn = await prisma.ghLConnection.findUnique({ where: { agencyId } });
  if (!conn) throw new Error("GHL not connected");
  return conn;
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
  clientSecret: string
) {
  const res = await fetch(`${GHL_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      user_type: "Company",
      redirect_uri: process.env.GHL_REDIRECT_URI || "",
    }),
  });
  if (!res.ok) {
    throw new Error(`GHL token exchange failed: ${res.status} ${await res.text()}`);
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
    locationId?: string;
    userId: string;
  };
  await prisma.ghLConnection.update({
    where: { agencyId },
    data: {
      mode: "LIVE",
      accessTokenEnc: encrypt(tok.access_token),
      refreshTokenEnc: encrypt(tok.refresh_token),
      tokenType: "Agency",
      expiresAt: new Date(Date.now() + (tok.expires_in - 60) * 1000),
      scope: tok.scope,
      locationId: tok.locationId ?? null,
      userId: tok.userId,
      lastRefreshedAt: new Date(),
      lastError: null,
      connectedAt: new Date(),
    },
  });
  return tok;
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
        client_secret: conn.clientSecretEnc
          ? decrypt(conn.clientSecretEnc) || ""
          : process.env.GHL_CLIENT_SECRET || "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        user_type: "Company",
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const tok = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };
    await prisma.ghLConnection.update({
      where: { agencyId },
      data: {
        accessTokenEnc: encrypt(tok.access_token),
        refreshTokenEnc: encrypt(tok.refresh_token),
        expiresAt: new Date(Date.now() + (tok.expires_in - 60) * 1000),
        scope: tok.scope,
        lastRefreshedAt: new Date(),
        lastError: null,
      },
    });
    await prisma.tokenEvent.create({
      data: { agencyId, kind: "refresh", detail: "Agency token refreshed" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.ghLConnection.update({
      where: { agencyId },
      data: { lastError: msg },
    });
    await prisma.tokenEvent.create({
      data: { agencyId, kind: "refresh_error", detail: msg },
    });
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
 * Get a location-scoped access token. LIVE: GET /oauth/replyUser?locationId
 * with the agency token. DEMO: derived deterministic token. Cached until
 * shortly before expiry.
 */
export async function getLocationToken(
  agencyId: string,
  locationId: string
): Promise<string> {
  const cacheKey = `${agencyId}:${locationId}`;
  const cached = g.__ppLocTokens!.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const conn = await getConn(agencyId);
  if (conn.mode === "DEMO") {
    const token = `demo-location-token-${locationId}-${Date.now()}`;
    g.__ppLocTokens!.set(cacheKey, { token, expiresAt: Date.now() + 3600_000 });
    return token;
  }

  let agencyToken = decrypt(conn.accessTokenEnc);
  if (!agencyToken || (conn.expiresAt && conn.expiresAt < new Date(Date.now() + 60_000))) {
    await refreshAgencyToken(agencyId);
    const fresh = await getConn(agencyId);
    agencyToken = decrypt(fresh.accessTokenEnc) || "";
  }

  const res = await fetch(
    `${GHL_BASE}/oauth/replyUser?locationId=${encodeURIComponent(locationId)}`,
    { headers: { Authorization: `Bearer ${agencyToken}`, Version: VERSION } }
  );
  if (!res.ok) {
    throw new Error(`oauth/replyUser failed: ${res.status}`);
  }
  const tok = (await res.json()) as { access_token: string; expires_in: number };
  g.__ppLocTokens!.set(cacheKey, {
    token: tok.access_token,
    expiresAt: Date.now() + (tok.expires_in - 30) * 1000,
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

/**
 * Location-scoped GET with global concurrency limit, per-location queue and
 * 429 exponential backoff. Retries status 401 once after a token refresh.
 */
export async function ghlLocationGet(
  agencyId: string,
  locationId: string,
  path: string
): Promise<unknown> {
  const release = await acquire(locationId);
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await getLocationToken(agencyId, locationId);
      const res = await fetch(`${GHL_BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Version: VERSION,
          Accept: "application/json",
        },
      });
      if (res.status === 429) {
        await sleep(backoffFor(attempt));
        continue;
      }
      if (res.status === 401) {
        g.__ppLocTokens!.delete(`${agencyId}:${locationId}`);
        await refreshAgencyToken(agencyId).catch(() => {});
        continue;
      }
      if (!res.ok) throw new GhlApiError(res.status, await res.text());
      return res.json();
    }
    throw new GhlApiError(429, "Rate limited after retries");
  } finally {
    release();
  }
}

/**
 * Location-scoped POST for scheduling. Same limiter/backoff as GET. Used for
 * CDN media uploads and social-media-posting posts.
 */
export async function ghlLocationPost(
  agencyId: string,
  locationId: string,
  path: string,
  body: unknown
): Promise<unknown> {
  const release = await acquire(locationId);
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await getLocationToken(agencyId, locationId);
      const res = await fetch(`${GHL_BASE}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Version: VERSION,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429) {
        await sleep(backoffFor(attempt));
        continue;
      }
      if (res.status === 401) {
        g.__ppLocTokens!.delete(`${agencyId}:${locationId}`);
        await refreshAgencyToken(agencyId).catch(() => {});
        continue;
      }
      if (!res.ok) throw new GhlApiError(res.status, await res.text());
      return res.json();
    }
    throw new GhlApiError(429, "Rate limited after retries");
  } finally {
    release();
  }
}

/** GET /locations/search — list sub-accounts under the agency. */
export async function listLocations(
  agencyId: string,
  search?: string
): Promise<Array<{ id: string; name: string; address?: string; logoUrl?: string }>> {
  const conn = await getConn(agencyId);
  if (conn.mode === "DEMO") {
    const { demoLocations } = await import("@/lib/ghlDemo");
    return demoLocations;
  }
  let token = decrypt(conn.accessTokenEnc) || "";
  if (conn.expiresAt && conn.expiresAt < new Date(Date.now() + 60_000)) {
    await refreshAgencyToken(agencyId);
    token = decrypt((await getConn(agencyId)).accessTokenEnc) || "";
  }
  const release = await acquire("agency");
  try {
    const q = search ? `&search=${encodeURIComponent(search)}` : "";
    const res = await fetch(`${GHL_BASE}/locations/search?limit=100${q}`, {
      headers: { Authorization: `Bearer ${token}`, Version: VERSION, Accept: "application/json" },
    });
    if (res.status === 401) {
      await refreshAgencyToken(agencyId);
      token = decrypt((await getConn(agencyId)).accessTokenEnc) || "";
    }
    if (!res.ok) throw new GhlApiError(res.status, await res.text());
    const data = (await res.json()) as {
      locations: Array<{ id: string; name: string; address?: string; logoUrl?: string }>;
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
  const data = (await ghlLocationGet(
    agencyId,
    locationId,
    `/social-media-posting/${locationId}/accounts`
  )) as { accounts?: Array<Record<string, unknown>> };
  return (data.accounts || []).map((a) => ({
    id: String(a.id),
    name: String((a as { name?: string }).name || "Account"),
    platform: String((a as { platform?: string }).platform || "unknown"),
    avatarUrl: (a as { avatarUrl?: string }).avatarUrl,
  }));
}

export interface GhlPostPayload {
  platform: string;
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
  type PostPayload = {
    path: string;
    body: Record<string, unknown>;
  };
  const postBody: Record<string, unknown> = {
    scheduledAt: payload.scheduledAt,
    status: "to-be-confirmed", // GHL requires scheduling status
  };
  const result = (await ghlLocationPost(
    agencyId,
    locationId,
    `/social-media-posting/${locationId}/posts`,
    {
      ...postBody,
      posts: [payload],
    }
  )) as { id?: string; succeeded?: Array<{ id: string }> };
  const id = result.id || result.succeeded?.[0]?.id;
  if (!id) throw new GhlApiError(500, "No post id returned");
  return { id };
}

/** GHL CDN upload for media used by scheduled posts. */
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
  )) as { id: string; signedUrl: string };
  if (signedUrl) {
    await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: new Uint8Array(data),
    });
  }
  return { url: `${GHL_BASE}/social-media-posting/${locationId}/media/${mediaId}`, mediaId };
}