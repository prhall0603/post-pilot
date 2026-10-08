// Demo Mode: fully simulated GHL + AI responses so the entire flow (OAuth,
// sub-accounts, connected platform accounts, media upload, scheduling) can be
// exercised before real GHL marketplace credentials exist.

import type { GhlPostPayload } from "@/lib/ghl";

export const demoLocations = [
  { id: "loc_demo_solar", name: "Sunrise Solar Co.", address: "124 Main St, Scottsdale, AZ" },
  { id: "loc_demo_dental", name: "Bright Smile Dental", address: "44 Oak Ave, Mesa, AZ" },
  { id: "loc_demo_fitness", name: "Peak Fitness Studio", address: "8 Elm St, Tempe, AZ" },
  { id: "loc_demo_landscaping", name: "GreenScape Landscaping", address: "210 Pine Rd, Chandler, AZ" },
  { id: "loc_demo_bakery", name: "Golden Crumb Bakery", address: "5 Maple Sq, Phoenix, AZ" },
];

interface DemoAccount {
  id: string;
  name: string;
  platform: string;
  avatarUrl?: string;
}

const demoAccountSets: Record<string, DemoAccount[]> = {
  default: [
    { id: "fbpage_001", name: "{company} on Facebook", platform: "facebook", avatarUrl: undefined },
    { id: "igbiz_001", name: "{company} IG", platform: "instagram" },
    { id: "lipage_001", name: "{company} LinkedIn", platform: "linkedin" },
    { id: "gbp_001", name: "{company} Google Profile", platform: "gbp" },
    { id: "tt_001", name: "{company} TikTok", platform: "tiktok" },
    { id: "yt_001", name: "{company} YouTube", platform: "youtube" },
    { id: "tw_001", name: "{company} X", platform: "twitter" },
  ],
};

export function demoAccountsFor(locationId: string): DemoAccount[] {
  return demoAccountSets.default.map((a) => ({
    ...a,
    name: a.name.replace("{company}", locationNameFor(locationId)),
  }));
}

export function locationNameFor(locationId: string): string {
  return demoLocations.find((l) => l.id === locationId)?.name || "Client Business";
}

const DEMO_FAILURES_KEY = "pp_demo_failures";
const g = globalThis as unknown as { [DEMO_FAILURES_KEY]?: Set<string> };
if (!g[DEMO_FAILURES_KEY]) g[DEMO_FAILURES_KEY] = new Set();

/** Deterministically simulate a GHL rejection for the Nth attempt of a post. */
function shouldSimulateRejection(locationId: string, payload: GhlPostPayload): string | null {
  const key = `${locationId}:${payload.platform}`;
  const fails = g[DEMO_FAILURES_KEY]!;
  const count = [...fails].filter((f) => f === key).length;
  if (payload.platform === "instagram" && count < 1) {
    fails.add(key);
    return "POST_ERROR: Instagram requires an image or video for every post. Attach media before scheduling.";
  }
  if (payload.platform === "gbp" && payload.body.length > 1200 && !payload.gbpPostType) {
    return "POST_ERROR: Google Business Profile post is missing the required local post type (update/event/offer).";
  }
  return null;
}

export function demoCreatePost(
  locationId: string,
  payload: GhlPostPayload
): { id: string } {
  const rejected = shouldSimulateRejection(locationId, payload);
  if (rejected) {
    // Simulate a real API rejection for retry testing.
    throw new Error(rejected);
  }
  return { id: `ghl_${locationId.slice(-6)}_${Date.now().toString(36)}` };
}

export function demoUploadMedia(fileName: string): { url: string; mediaId: string } {
  return {
    url: `https://demo-cdn.leadconnectorhq.com/demo/${encodeURIComponent(fileName)}`,
    mediaId: `media_${Math.random().toString(36).slice(2, 10)}`,
  };
}