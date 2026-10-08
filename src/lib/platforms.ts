// Platform rules — single source of truth shared by generation + scheduling.

export type PlatformId =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "gbp"
  | "tiktok"
  | "youtube"
  | "twitter";

export const PLATFORMS: PlatformId[] = [
  "facebook",
  "instagram",
  "linkedin",
  "gbp",
  "tiktok",
  "youtube",
  "twitter",
];

export interface PlatformRule {
  id: PlatformId;
  name: string;
  /** Max caption length enforced by trimmer. */
  maxLen: number;
  /** Post requires video before scheduling. */
  videoRequired: boolean;
  /** Post requires an image or video before scheduling. */
  mediaRequired: boolean;
  /** Video-first product (title + description, script always). */
  videoFirst: boolean;
  /** Hashtags are de-emphasized (GBP). */
  noHashtagEmphasis: boolean;
  /** Thread creation when body exceeds this many chars (Twitter/X). */
  threadAt?: number | null;
  /** X Premium raises the char ceiling. */
  premiumCeiling?: number | null;
  mediaKinds: Array<"image" | "video">;
  /** Short caption preview length (TikTok shows ~150 chars). */
  captionPreview?: number;
  accentHex: string;
}

export const PLATFORM_RULES: Record<PlatformId, PlatformRule> = {
  facebook: {
    id: "facebook",
    name: "Facebook Page",
    maxLen: 63206,
    videoRequired: false,
    mediaRequired: false,
    videoFirst: false,
    noHashtagEmphasis: false,
    threadAt: null,
    premiumCeiling: null,
    mediaKinds: ["image", "video"],
    accentHex: "#1877F2",
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    maxLen: 2200,
    videoRequired: false,
    mediaRequired: true, // image or video REQUIRED — never schedule without
    videoFirst: false,
    noHashtagEmphasis: false,
    threadAt: null,
    premiumCeiling: null,
    mediaKinds: ["image", "video"],
    accentHex: "#E1306C",
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    maxLen: 3000,
    videoRequired: false,
    mediaRequired: false,
    videoFirst: false,
    noHashtagEmphasis: false,
    threadAt: null,
    premiumCeiling: null,
    mediaKinds: ["image", "video"],
    accentHex: "#0A66C2",
  },
  gbp: {
    id: "gbp",
    name: "Google Business Profile",
    maxLen: 1500, // conservative scheduling cap; body stays under 1200 when possible
    videoRequired: false,
    mediaRequired: false,
    videoFirst: false,
    noHashtagEmphasis: true,
    threadAt: null,
    premiumCeiling: null,
    mediaKinds: ["image"],
    accentHex: "#4285F4",
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    maxLen: 2200,
    videoRequired: true, // video required (image slideshow acceptable)
    mediaRequired: true,
    videoFirst: true,
    noHashtagEmphasis: false,
    threadAt: null,
    premiumCeiling: null,
    mediaKinds: ["video", "image"],
    captionPreview: 150,
    accentHex: "#000000",
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    maxLen: 5000,
    videoRequired: true, // video REQUIRED (upload or schedule)
    mediaRequired: true,
    videoFirst: true,
    noHashtagEmphasis: false,
    threadAt: null,
    premiumCeiling: null,
    mediaKinds: ["video"],
    accentHex: "#FF0000",
  },
  twitter: {
    id: "twitter",
    name: "Twitter/X",
    maxLen: 280,
    videoRequired: false,
    mediaRequired: false,
    videoFirst: false,
    noHashtagEmphasis: false,
    threadAt: 280, // thread creation when over limit
    premiumCeiling: 25000, // X Premium longer posts
    mediaKinds: ["image", "video"],
    accentHex: "#0F1419",
  },
};

export function isPlatformId(v: string): v is PlatformId {
  return (PLATFORMS as string[]).includes(v);
}

export function platformName(id: string): string {
  return isPlatformId(id) ? PLATFORM_RULES[id].name : id;
}

/** Instagram/TikTok/YouTube require media. */
export function mediaRequiredFor(platform: string): boolean {
  return isPlatformId(platform) ? PLATFORM_RULES[platform].mediaRequired : false;
}

export const CATEGORIES = [
  "educational",
  "promotional",
  "social_proof",
  "local_community",
  "holiday_seasonal",
  "behind_the_scenes",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  educational: "Educational",
  promotional: "Promotional",
  social_proof: "Social proof",
  local_community: "Local/community",
  holiday_seasonal: "Holiday/seasonal",
  behind_the_scenes: "Behind the scenes",
};

/**
 * Base content mix weights (percent):
 * Educational 40, Promotional 20, Social proof 15, Local 10, Holiday 10, BTS 5.
 */
export const BASE_MIX: Record<Category, number> = {
  educational: 40,
  promotional: 20,
  social_proof: 15,
  local_community: 10,
  holiday_seasonal: 10,
  behind_the_scenes: 5,
};

/**
 * Per-platform style adjustments (percent-point nudges).
 * GBP leans local/community, YouTube leans educational long-form,
 * TikTok leans behind-the-scenes, LinkedIn leans B2B proof.
 * Promotional never exceeds 20% anywhere.
 */
export const PLATFORM_MIX_ADJUSTMENTS: Record<PlatformId, Partial<Record<Category, number>>> = {
  facebook: {},
  instagram: { social_proof: +5, educational: -5 },
  linkedin: { educational: +5, social_proof: +5, local_community: -10 },
  gbp: { local_community: +15, educational: -5, promotional: -5, social_proof: -5 },
  tiktok: { behind_the_scenes: +10, educational: -5, local_community: -5 },
  youtube: { educational: +15, promotional: -10, social_proof: -5 },
  twitter: { educational: +5, social_proof: +5, local_community: -10 },
};

/** Adjusted mix per platform, normalized to 100, promo capped at 20. */
export function mixForPlatform(platform: PlatformId): Record<Category, number> {
  const adj = PLATFORM_MIX_ADJUSTMENTS[platform] || {};
  const raw = { ...BASE_MIX };
  let sum = 0;
  for (const c of CATEGORIES) {
    raw[c] = Math.max(0, raw[c] + (adj[c] || 0));
    sum += raw[c];
  }
  const out = {} as Record<Category, number>;
  let acc = 0;
  const keys = [...CATEGORIES];
  for (let i = 0; i < keys.length; i++) {
    if (i === keys.length - 1) {
      out[keys[i]] = 100 - acc;
    } else {
      const v = Math.round((raw[keys[i]] / sum) * 100);
      out[keys[i]] = v;
      acc += v;
    }
  }
  if (out.promotional > 20) {
    const excess = out.promotional - 20;
    out.promotional = 20;
    out.educational += excess;
  }
  return out;
}

/** Trim generated body to platform max, cutting whole sentences when possible. */
export function trimForPlatform(platform: string, body: string): string {
  const maxLen = isPlatformId(platform) ? PLATFORM_RULES[platform].maxLen : 280;
  const t = body.trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen - 1);
  const lastStop = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
    cut.lastIndexOf("\n\n")
  );
  return lastStop > maxLen * 0.5 ? cut.slice(0, lastStop + 1).trim() : cut.trim() + "…";
}