// Demo Mode: fully simulated GHL + AI responses so the entire flow (OAuth,
// sub-accounts, connected platform accounts, media upload, scheduling, and
// platform rejections) can be exercised before real GHL marketplace
// credentials exist. Also seeds demo agencies with a sample client on first
// login so the dashboard is not empty.

import type { GhlPostPayload } from "@/lib/ghl";
import { PLATFORM_RULES, isPlatformId } from "@/lib/platforms";

export const DEMO_LOCATIONS = [
  { id: "loc_demo_solar", name: "Sunrise Solar Co.", address: "124 Main St, Scottsdale, AZ" },
  { id: "loc_demo_dental", name: "Bright Smile Dental", address: "44 Oak Ave, Mesa, AZ" },
  { id: "loc_demo_fitness", name: "Peak Fitness Studio", address: "8 Elm St, Tempe, AZ" },
  { id: "loc_demo_landscaping", name: "GreenScape Landscaping", address: "210 Pine Rd, Chandler, AZ" },
  { id: "loc_demo_bakery", name: "Golden Crumb Bakery", address: "5 Maple Sq, Phoenix, AZ" },
];

export function locationNameFor(locationId: string): string {
  return DEMO_LOCATIONS.find((l) => l.id === locationId)?.name || "Client Business";
}

const DEMO_ACCOUNT_TEMPLATES = [
  { platform: "facebook", name: "{company} on Facebook", id: "fbpage_001" },
  { platform: "instagram", name: "{company} IG", id: "igbiz_001" },
  { platform: "linkedin", name: "{company} LinkedIn", id: "lipage_001" },
  { platform: "gbp", name: "{company} Google Profile", id: "gbp_001" },
  { platform: "tiktok", name: "{company} TikTok", id: "tt_001" },
  { platform: "youtube", name: "{company} YouTube", id: "yt_001" },
  { platform: "twitter", name: "{company} X", id: "tw_001" },
];

export function demoAccountsFor(locationId: string): Array<{
  id: string;
  name: string;
  platform: string;
  avatarUrl?: string;
}> {
  const company = locationNameFor(locationId);
  return DEMO_ACCOUNT_TEMPLATES.map((a) => ({
    id: `${a.id}_${locationId.slice(-6)}`,
    name: a.name.replace("{company}", company),
    platform: a.platform,
  }));
}

const g = globalThis as unknown as { [key: string]: unknown };
const DEMO_FAILURES_KEY = "pp_demo_failures";
if (!g[DEMO_FAILURES_KEY]) g[DEMO_FAILURES_KEY] = new Set<string>();

/**
 * Deterministically simulate a real GHL rejection the FIRST time a location's
 * Instagram post is scheduled without media — matching the live API rule.
 * Every other rejection is deterministic from the payload.
 */
function rejectionFor(payload: GhlPostPayload): string | null {
  const fails = g[DEMO_FAILURES_KEY] as Set<string>;
  const key = `${payload.locationId}:${payload.platform}`;
  if (payload.platform === "instagram" && !payload.mediaUrls.length && !fails.has(key)) {
    fails.add(key); // first attempt allowed to fail so the tray can be demoed
    return null;
  }
  if (payload.platform === "instagram" && !payload.mediaUrls.length) {
    return "POST_ERROR: Instagram requires an image or video for every post. Attach media before scheduling.";
  }
  if (isPlatformId(payload.platform)) {
    const rules = PLATFORM_RULES[payload.platform];
    if (rules.videoRequired && !payload.mediaUrls.length && payload.platform !== "tiktok") {
      return `POST_ERROR: ${rules.name} requires a video. Attach one in the media library first.`;
    }
    if (payload.platform === "gbp" && payload.body.length > 1500) {
      return "POST_ERROR: Google Business Profile posts must stay within 1,500 characters.";
    }
    if (payload.platform === "twitter" && payload.body.length > 280 && !payload.isThread) {
      return "POST_ERROR: X posts must be 280 characters unless threaded (X Premium allows longer).";
    }
  }
  return null;
}

export function demoCreatePost(locationId: string, payload: GhlPostPayload): { id: string } {
  const rejected = rejectionFor({ ...payload, locationId });
  if (rejected) throw new Error(rejected);
  return { id: `ghl_${locationId.slice(-6)}_${Date.now().toString(36)}` };
}

export function demoUploadMedia(fileName: string): { url: string; mediaId: string } {
  return {
    url: `https://demo-cdn.leadconnectorhq.com/demo/${encodeURIComponent(fileName)}`,
    mediaId: `media_${Math.random().toString(36).slice(2, 10)}`,
  };
}

/** Reset the simulated one-time Instagram no-media rejection (demo tray testing). */
export function resetDemoFailures(): void {
  (g[DEMO_FAILURES_KEY] as Set<string>).clear();
}

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/crypto";
import { trimForPlatform } from "@/lib/platforms";

interface DemoClientSpec {
  name: string;
  industry: string;
  website: string;
  locationId: string;
  brandVoice: string;
  targetAudience: string;
  serviceArea: string;
  products: Array<{ name: string; description: string }>;
  platforms: Array<{ platform: string; cadenceWeekly: number }>;
}

const DEMO_CLIENT: DemoClientSpec = {
  name: "Sunrise Solar Co.",
  industry: "Residential solar installation",
  website: "https://sunrisesolar.example.com",
  locationId: "loc_demo_solar",
  brandVoice: "friendly",
  targetAudience: "Homeowners aged 30-60 considering solar",
  serviceArea: "Phoenix metro, AZ",
  products: [
    { name: "Rooftop solar install", description: "Full-service residential solar panel installation" },
    { name: "Battery backup", description: "Home battery storage for outages and peak shaving" },
    { name: "Panel cleaning", description: "Annual cleaning and inspection plan" },
  ],
  platforms: [
    { platform: "facebook", cadenceWeekly: 3 },
    { platform: "instagram", cadenceWeekly: 3 },
    { platform: "gbp", cadenceWeekly: 2 },
    { platform: "linkedin", cadenceWeekly: 1 },
  ],
};

const DEMO_POST_BLUEPRINTS: Array<{ day: number; time: string; platform: string; category: string; topic: string; body: string; gbpType?: string }> = [
  { day: 2, time: "09:00", platform: "facebook", category: "educational", topic: "How rooftop solar saves money through summer peaks", body: "Did you know your air conditioner works hardest exactly when the sun is strongest? Sunrise Solar Co. explains how rooftop panels turn those peak-hours bills into predictable, lower payments.\n\nCurious what your roof could produce? Ask the team for a free layout sketch — no pressure, just numbers." },
  { day: 3, time: "11:30", platform: "instagram", category: "social_proof", topic: "Installation day timelapse", body: "From bare shingles to a full array before lunch. This Mesa install took the crew just under five hours.\n\nSwipe for the before/after — and imagine your meter spinning backwards." },
  { day: 4, time: "15:00", platform: "gbp", category: "local_community", topic: "Meet us at the Mesa Home Show", body: "Sunrise Solar Co. will be at the Mesa Home Show this Saturday. Stop by booth 12 to see real panel samples and ask anything about going solar in the Valley." },
  { day: 5, time: "10:00", platform: "facebook", category: "promotional", topic: "Summer install slots open", body: "Summer install calendar is open! Book your site assessment this week and lock current panel pricing before the fall rate change.\n\n[PLACEHOLDER: current offer details]" },
  { day: 9, time: "13:00", platform: "instagram", category: "educational", topic: "Battery backup 101", body: "Outage insurance, explained. A home battery keeps the fridge, wifi, and medical devices running when the grid doesn't.\n\nAsk the team which size fits your home — most Mesa homes need less than they think." },
  { day: 10, time: "09:30", platform: "gbp", category: "promotional", topic: "Fall maintenance offer", body: "Fall special: panel cleaning plus a full system checkup for [PLACEHOLDER: price]. Sunrise Solar Co. keeps your array producing at its best. Call to book your slot." },
  { day: 11, time: "16:00", platform: "linkedin", category: "behind_the_scenes", topic: "How we design an array", body: "Every proposal starts with a shade study, not a sales script. Sunrise Solar Co.'s design team models a full year of production before quoting a single panel — so you know exactly what you're buying." },
  { day: 16, time: "09:00", platform: "facebook", category: "behind_the_scenes", topic: "Crew spotlight", body: "Meet the crew that makes it happen. Sunrise Solar Co.'s install teams are all employees — never subcontractors — and every one is NISA-certified.\n\n[PLACEHOLDER: crew member name] has been with us since [PLACEHOLDER: year]." },
];

/** Seed a demo agency with one fully worked client so the UI is never empty. */
export async function seedDemoAgency(agencyId: string): Promise<void> {
  const existing = await prisma.client.count({ where: { agencyId } });
  if (existing > 0) return;
  const client = await prisma.client.create({
    data: {
      agencyId,
      name: DEMO_CLIENT.name,
      industry: DEMO_CLIENT.industry,
      website: DEMO_CLIENT.website,
      locationId: DEMO_CLIENT.locationId,
      brandVoice: DEMO_CLIENT.brandVoice,
      targetAudience: DEMO_CLIENT.targetAudience,
      serviceArea: DEMO_CLIENT.serviceArea,
      planStatus: "GENERATED",
      generatedUntil: new Date(Date.UTC(new Date().getUTCFullYear(), 11, 1)),
      aiTokensEstimated: 148_000,
      aiCostEstimated: 17.76,
      platforms: { create: DEMO_CLIENT.platforms },
      products: { create: DEMO_CLIENT.products },
    },
  });
  const now = new Date();
  const rows = DEMO_POST_BLUEPRINTS.map((b, i) => ({
    clientId: client.id,
    platform: b.platform,
    scheduledDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), b.day)),
    time: b.time,
    body: trimForPlatform(b.platform, b.body),
    hashtags: b.platform === "gbp" ? null : b.platform === "instagram" ? "#solaryourhome #arizonasolar #localbusiness" : "#solar #arizonasolar #localbusiness",
    imagePrompt: b.platform === "instagram" ? `Warm rooftop photo of ${DEMO_CLIENT.name} crew working, golden hour` : null,
    status: (b.day < 13 ? (i === 1 ? "APPROVED" : "SCHEDULED") : b.category === "promotional" ? "DRAFT" : "APPROVED") as "APPROVED" | "SCHEDULED" | "DRAFT",
    contentTopic: b.topic,
    category: b.category,
    mediaRequired: b.platform === "instagram",
    ghlAccountId: `${b.platform}_${DEMO_CLIENT.locationId.slice(-6)}`,
    scheduledAt: b.day < 13 ? new Date() : null,
    ghlPostId: b.day < 13 ? `ghl_seed_${i}` : null,
  }));
  await prisma.post.createMany({ data: rows });
  await prisma.platformAccount.createMany({
    data: [
      { clientId: client.id, locationId: DEMO_CLIENT.locationId, platform: "facebook", ghlAccountId: `facebook_${DEMO_CLIENT.locationId.slice(-6)}`, accountName: "Sunrise Solar Co. on Facebook" },
      { clientId: client.id, locationId: DEMO_CLIENT.locationId, platform: "instagram", ghlAccountId: `instagram_${DEMO_CLIENT.locationId.slice(-6)}`, accountName: "Sunrise Solar Co. IG" },
      { clientId: client.id, locationId: DEMO_CLIENT.locationId, platform: "gbp", ghlAccountId: `gbp_${DEMO_CLIENT.locationId.slice(-6)}`, accountName: "Sunrise Solar Co. Google Profile" },
      { clientId: client.id, locationId: DEMO_CLIENT.locationId, platform: "linkedin", ghlAccountId: `linkedin_${DEMO_CLIENT.locationId.slice(-6)}`, accountName: "Sunrise Solar Co. LinkedIn" },
    ],
  });
  await prisma.tokenEvent.create({
    data: { agencyId, kind: "connect", detail: "Demo Mode activated with simulated agency tokens" },
  });
}