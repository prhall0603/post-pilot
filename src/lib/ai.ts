// AI content generation via Ollama (OpenAI-compatible endpoint).
// One API call per month (12 batches for a year) with per-batch retry, demo
// fallback when AI_API_KEY is absent, and strict rules: third-person voice,
// promotional ≤ 20%, no invented stats/testimonials — [PLACEHOLDER] instead.

import { prisma } from "@/lib/prisma";
import {
  CATEGORIES,
  PLATFORM_RULES,
  isPlatformId,
  mixForPlatform,
  trimForPlatform,
  type Category,
  type PlatformId,
} from "@/lib/platforms";

export const AI_BASE_URL = process.env.AI_BASE_URL || "https://api.ollama.com/v1";
export const AI_MODEL = process.env.AI_MODEL || "gpt-oss:120b";
const COST_PER_1K_TOKENS = 0.00012; // rough blended estimate for cost display

export const monthName = (d: Date) =>
  d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export function firstOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
export function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
export function daysInMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Is generation running against real Ollama, or the built-in demo generator? */
export function aiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

export function aiMode(): "ai" | "demo" {
  return aiConfigured() ? "ai" : "demo";
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** One OpenAI-compatible chat completion against Ollama. */
async function chat(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<{ content: string; tokens: number }> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI_API_KEY not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        temperature: opts?.temperature ?? 0.8,
        max_tokens: opts?.maxTokens ?? 16000,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`AI API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content || "";
    return { content, tokens: data.usage?.total_tokens || estimateTokens(content) };
  } finally {
    clearTimeout(timeout);
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Extract the outermost JSON object from a model reply (handles fences/prose). */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in AI reply");
  return JSON.parse(candidate.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Demo AI — deterministic templated content so the whole flow works without
// credentials. Produces sensible third-person copy with [PLACEHOLDER] tokens.
// ---------------------------------------------------------------------------

const DEMO_TOPICS: Record<Category, string[]> = {
  educational: [
    "How {service} works, step by step",
    "Three mistakes to avoid with {service}",
    "What to expect on your first visit",
    "A quick explainer for first-timers",
  ],
  promotional: ["Current offer", "Seasonal promotion", "Service spotlight", "Limited-time deal"],
  social_proof: ["Customer story", "A recent project", "What clients say", "Results spotlight"],
  local_community: ["Neighborhood roundup", "Local event spotlight", "Community involvement", "Area guide"],
  holiday_seasonal: ["Seasonal tips", "Holiday hours", "Celebrating the season", "Year-end wrap-up"],
  behind_the_scenes: ["Meet the team", "How we prep a job", "A day in the life", "Tool talk"],
};

const TIMES = ["09:00", "11:30", "15:00", "17:30", "19:00", "08:00", "13:00"];

function demoGenerate(
  client: { name: string; industry: string; serviceArea?: string | null },
  platform: PlatformId,
  category: Category,
  month: Date,
  i: number
) {
  const topics = DEMO_TOPICS[category];
  const topic = topics[i % topics.length].replace("{service}", client.industry.toLowerCase());
  const m = monthName(month).split(" ")[0];
  const rules = PLATFORM_RULES[platform];
  let body =
    `${client.name} is here with a fresh thought for ${m}: ${topic}.\n\n` +
    `As a ${client.industry.toLowerCase()} business` +
    (client.serviceArea ? ` serving ${client.serviceArea}` : "") +
    `, the team focuses on doing things the right way. This month the spotlight is on ${topic.toLowerCase()} — [PLACEHOLDER: short supporting detail from the team].\n\nReach out to learn more.`;
  if (category === "promotional") {
    body = `A deal worth talking about at ${client.name}.\n\n[PLACEHOLDER: current offer details] — valid through ${m}. Contact the team to book.`;
  }
  if (category === "social_proof") {
    body = `Clients of ${client.name} keep the team motivated. [PLACEHOLDER: customer name], a recent [PLACEHOLDER: service type] client, shared: [PLACEHOLDER: testimonial snippet]. Proud to serve.`;
  }
  if (platform === "twitter") body = `${client.name}: ${topic}. [PLACEHOLDER: detail]`;
  if (platform === "gbp") {
    body = `${client.name} — ${topic}. [PLACEHOLDER: short local update detail for customers in ${client.serviceArea || "the area"}].`;
  }
  if (rules.videoFirst && platform !== "youtube") {
    body = `In this video, ${client.name} walks through ${topic.toLowerCase()}. Watch for the [PLACEHOLDER: key takeaway]. Follow for more.`;
  }
  if (platform === "youtube") {
    body = `What you'll see: ${topic.toLowerCase()} from start to finish, plus what to expect when you work with a local ${client.industry.toLowerCase()} team.`;
  }
  if (platform === "facebook") {
    body = `A quick note from ${client.name} for ${m}: ${topic}.\n\nThe team put together a short guide on this — comment below and they'll send it over.`;
  }
  return { body, topic };
}

function hashtagsFor(platform: PlatformId, client: { industry: string; serviceArea?: string | null }): string {
  if (platform === "gbp") return ""; // no hashtag emphasis
  const base = client.industry.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 18) || "localbusiness";
  const local = (client.serviceArea || "").toLowerCase().replace(/[^a-z]+/g, "").slice(0, 14);
  const tags = ["#" + base, "#localbusiness", "#smallbiztips"];
  if (local) tags.push("#" + local);
  return tags.join(" ");
}

// ---------------------------------------------------------------------------
// Planning primitives
// ---------------------------------------------------------------------------

interface Slot {
  platform: PlatformId;
  category: Category;
  day: number;
  time: string;
}

function largestRemainder(total: number, weights: Record<string, number>): Record<string, number> {
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const exact = Object.entries(weights).map(([k, w]) => [k, (w / weightSum) * total] as const);
  const out: Record<string, number> = {};
  let assigned = 0;
  const remainders: Array<[string, number]> = [];
  for (const [k, v] of exact) {
    const floor = Math.floor(v);
    out[k] = floor;
    assigned += floor;
    remainders.push([k, v - floor]);
  }
  remainders.sort((a, b) => b[1] - a[1]);
  let i = 0;
  while (assigned < total && remainders.length) {
    const [k] = remainders[i % remainders.length];
    out[k] += 1;
    assigned += 1;
    i += 1;
  }
  return out;
}

/** Build deterministic slots for a month respecting per-platform cadence+mix. */
export function planSlots(
  platforms: Array<{ platform: PlatformId; cadenceWeekly: number }>,
  month: Date,
  blackoutDays: Set<number>
): Slot[] {
  const dim = daysInMonth(month);
  const weeks = dim / 7;
  const slots: Slot[] = [];
  for (const { platform, cadenceWeekly } of platforms) {
    const total = Math.max(1, Math.round(weeks * cadenceWeekly));
    const mix = mixForPlatform(platform);
    const weights: Record<string, number> = {};
    for (const c of CATEGORIES) weights[c] = mix[c];
    const counts = largestRemainder(total, weights);
    // clamp promotional to 20% of the platform's monthly total
    if (counts.promotional > Math.floor(total * 0.2)) {
      counts.educational += counts.promotional - Math.floor(total * 0.2);
      counts.promotional = Math.floor(total * 0.2);
    }
    let idx = 0;
    for (const cat of CATEGORIES) {
      for (let k = 0; k < (counts[cat] || 0); k++) {
        let day = Math.min(dim, 1 + Math.floor((idx * dim) / Math.max(1, total)));
        for (let shift = 0; shift < 6 && blackoutDays.has(day); shift++) {
          day = day === dim ? 2 : day + 1; // dodge blackout dates
        }
        slots.push({ platform, category: cat, day, time: TIMES[(idx * 3 + day) % TIMES.length] });
        idx += 1;
      }
    }
  }
  slots.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  return slots;
}

// ---------------------------------------------------------------------------
// Month generation — one AI call per month, retried on failure
// ---------------------------------------------------------------------------

export interface GeneratedItem {
  platform: PlatformId;
  category: Category;
  day: number;
  time: string;
  title?: string;
  body: string;
  hashtags?: string;
  imagePrompt?: string;
  videoScript?: string;
  gbpPostType?: string;
}

function buildPrompt(
  client: ClientLike,
  month: Date,
  slots: Slot[]
): string {
  const platformLines = client.platforms
    .map((p) => {
      const r = PLATFORM_RULES[p.platform];
      return `- ${r.name} (${p.platform}): max ${r.maxLen} chars, media ${r.mediaRequired ? "REQUIRED" : "optional"}${r.videoRequired ? ", video REQUIRED" : ""}${r.noHashtagEmphasis ? ", do NOT include hashtags" : ""}${p.platform === "youtube" ? ", write a title too" : ""}`;
    })
    .join("\n");
  const slotLines = slots
    .map(
      (s, idx) =>
        `${idx}. { "platform": "${s.platform}", "category": "${s.category}", "day": ${s.day}, "time": "${s.time}" }`
    )
    .join("\n");
  return `You are a senior social media strategist. Write a month of posts for a client.

CLIENT
Company: ${client.name}
Industry: ${client.industry}
Website: ${client.website || "n/a"}
Brand voice: ${client.brandVoice}${client.brandVoiceNotes ? ` — style notes: ${client.brandVoiceNotes}` : ""}
Products/services: ${client.products.map((p) => `${p.name} (${p.description})`).join("; ") || "n/a"}
Target audience: ${client.targetAudience || "general local customers"}
Geographic service area: ${client.serviceArea || "n/a"}

MONTH: ${monthName(month)} — make posts seasonal/regional where sensible.
VOICE: Write in third person ABOUT the company ("${client.name} is...", "the team...").
STRICT RULES
- NEVER invent statistics, percentages, dollar results, testimonials, awards, or years in business. Where a real number or quote would go, write [PLACEHOLDER: description] instead. The reviewer fills these in before approval.
- ${client.blackouts.length ? `Do NOT create posts on these closed dates: ${client.blackouts.join(", ")}.` : "No blackout constraints."}
- ${client.recentTopics.length ? `Avoid repeating these recent topics: ${client.recentTopics.slice(0, 30).join("; ")}.` : "No topic repetition constraints."}
PLATFORM CONSTRAINTS
${platformLines}
- Google Business Profile body must stay under 1200 chars and describe a local update, event, or offer. Do not include hashtags for GBP.
- Twitter/X bodies must fit 280 chars including hashtags; punchy one-liners.
- YouTube: "title" (max 90 chars) plus "body" as the video description; ALWAYS include "videoScript" with a numbered shot list.
- TikTok: short punchy body; ALWAYS include "videoScript" with a numbered shot list.
- Instagram: ALWAYS include "imagePrompt" (vivid photo idea) or "videoScript" (reel).

Return ONLY JSON in this exact shape — one item per slot, same count and order:
{ "items": [ { "platform": string, "category": string, "day": number, "time": "HH:MM", "title": string (YouTube only), "body": string, "hashtags": string (not for GBP), "imagePrompt": string (Instagram always; others when an image fits), "videoScript": string (video platforms; numbered shot list), "gbpPostType": "update"|"event"|"offer" (GBP only) } ] }

SLOTS
${slotLines}`;
}

export interface ClientLike {
  name: string;
  industry: string;
  website?: string | null;
  brandVoice: string;
  brandVoiceNotes?: string | null;
  targetAudience?: string | null;
  serviceArea?: string | null;
  products: Array<{ name: string; description: string }>;
  platforms: Array<{ platform: PlatformId; cadenceWeekly: number }>;
  blackouts: string[];
  recentTopics: string[];
}

export interface GenerateMonthResult {
  items: GeneratedItem[];
  tokensUsed: number;
  mode: "ai" | "demo";
}

export async function generateMonth(client: ClientLike, month: Date): Promise<GenerateMonthResult> {
  const blackoutDays = new Set<number>();
  const slots = planSlots(client.platforms, month, blackoutDays);
  const prompt = buildPrompt(client, month, slots);

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (!aiConfigured()) {
        // ---- Demo Mode AI ----
        const items: GeneratedItem[] = slots.map((s, idx) => {
          const { body, topic } = demoGenerate(
            { name: client.name, industry: client.industry, serviceArea: client.serviceArea },
            s.platform,
            s.category,
            month,
            idx + s.day
          );
          const rules = PLATFORM_RULES[s.platform];
          const imagePrompt =
            s.platform === "instagram" || !rules.videoFirst
              ? `Authentic, well-lit photo for ${client.name}: ${topic.toLowerCase()} — natural colors, real setting`
              : undefined;
          return {
            platform: s.platform,
            category: s.category,
            day: s.day,
            time: s.time,
            title: s.platform === "youtube" ? `${topic} | ${client.name}`.slice(0, 100) : undefined,
            body: trimForPlatform(s.platform, body),
            hashtags: rules.noHashtagEmphasis ? "" : hashtagsFor(s.platform, client),
            imagePrompt,
            videoScript: rules.videoFirst
              ? `Shot list for "${topic}":\n1) Opening hook — team member addresses camera.\n2) Show the ${client.industry.toLowerCase()} work in progress.\n3) Close-up detail shot.\n4) [PLACEHOLDER: customer quote b-roll].\n5) Outro with logo and call to action.`
              : undefined,
            gbpPostType:
              s.platform === "gbp"
                ? s.category === "promotional"
                  ? "offer"
                  : s.category === "local_community"
                    ? "event"
                    : "update"
                : undefined,
          };
        });
        return {
          items,
          tokensUsed: estimateTokens(prompt + JSON.stringify(items).length),
          mode: "demo",
        };
      }

      // ---- Real AI (Ollama) ----
      const { content, tokens } = await chat([
        {
          role: "system",
          content:
            "You are a senior social media strategist who writes platform-tailored, third-person brand copy. Output only valid JSON — no commentary.",
        },
        { role: "user", content: prompt },
      ]);
      const parsed = extractJson(content) as { items?: unknown };
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
        throw new Error("AI returned no items");
      }
      const items: GeneratedItem[] = (parsed.items as Array<Record<string, unknown>>).map((it, i) => {
        const platform = String(it.platform || slots[i]?.platform || "");
        if (!isPlatformId(platform)) throw new Error(`Bad platform: ${platform}`);
        const category = (CATEGORIES as readonly string[]).includes(String(it.category))
          ? (String(it.category) as Category)
          : "educational";
        const rules = PLATFORM_RULES[platform];
        return {
          platform,
          category,
          day: Math.max(1, Math.min(daysInMonth(month), Number(it.day) || slots[i]?.day || 1)),
          time: /^\d{2}:\d{2}$/.test(String(it.time || "")) ? String(it.time) : slots[i]?.time || "09:00",
          title: it.title ? String(it.title).slice(0, 100) : undefined,
          body: trimForPlatform(platform, String(it.body || "")),
          hashtags: rules.noHashtagEmphasis ? "" : it.hashtags ? String(it.hashtags) : "",
          imagePrompt: it.imagePrompt ? String(it.imagePrompt) : undefined,
          videoScript: it.videoScript ? String(it.videoScript) : undefined,
          gbpPostType: it.gbpPostType ? String(it.gbpPostType) : undefined,
        };
      });
      return { items, tokensUsed: tokens, mode: "ai" };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Generate a plan in monthly batches, persisting each month as it completes. */
export async function generateYearPlan(
  clientId: string,
  months = 12
): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      platforms: true,
      products: true,
      blackoutDates: true,
      posts: { select: { contentTopic: true }, orderBy: { scheduledDate: "desc" }, take: 60 },
    },
  });
  if (!client) throw new Error("Client not found");
  const platforms = client.platforms
    .filter((p): p is typeof p & { platform: PlatformId } => isPlatformId(p.platform))
    .map((p) => ({ platform: p.platform, cadenceWeekly: p.cadenceWeekly }));
  if (platforms.length === 0) throw new Error("No platforms selected");

  const clientLike: ClientLike = {
    name: client.name,
    industry: client.industry,
    website: client.website,
    brandVoice: client.brandVoice,
    brandVoiceNotes: client.brandVoiceNotes,
    targetAudience: client.targetAudience,
    serviceArea: client.serviceArea,
    products: client.products.slice(0, 12).map((p) => ({ name: p.name, description: p.description })),
    platforms,
    blackouts: client.blackoutDates.map((b) => `${b.date.toISOString().slice(0, 10)} (${b.reason})`),
    recentTopics: client.posts.map((p) => p.contentTopic),
  };

  await prisma.client.update({ where: { id: clientId }, data: { planStatus: "GENERATING" } });
  const start =
    client.generatedUntil && isFinite(new Date(client.generatedUntil).getTime())
      ? addMonths(firstOfMonth(client.generatedUntil), 1)
      : firstOfMonth(new Date());

  let tokens = 0;
  try {
    for (let m = 0; m < months; m++) {
      const month = addMonths(start, m);
      const result = await generateMonth(clientLike, month);
      tokens += result.tokensUsed || 0;
      const rows = result.items.map((it) => ({
        clientId,
        platform: it.platform,
        scheduledDate: new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), it.day)),
        time: it.time,
        body: it.body,
        imagePrompt: it.imagePrompt ?? null,
        videoScript: it.videoScript ?? null,
        hashtags: it.hashtags || null,
        title: it.title ?? null,
        status: "DRAFT" as const,
        contentTopic:
          it.title || (it.body.split("\n")[0] || "").slice(0, 60) || it.category,
        category: it.category,
        mediaRequired: PLATFORM_RULES[it.platform].mediaRequired,
      }));
      await prisma.post.createMany({ data: rows });
      await prisma.client.update({ where: { id: clientId }, data: { generatedUntil: month } });
    }
    await prisma.client.update({
      where: { id: clientId },
      data: {
        planStatus: "GENERATED",
        aiTokensEstimated: { increment: tokens },
        aiCostEstimated: { increment: (tokens / 1000) * COST_PER_1K_TOKENS },
      },
    });
  } catch (e) {
    await prisma.client.update({ where: { id: clientId }, data: { planStatus: "GENERATED" } }).catch(() => {});
    throw e;
  }
}

/** Delete unscheduled drafts+approved from a date onward (cadence change). */
export async function clearUnscheduledFrom(clientId: string): Promise<number> {
  const res = await prisma.post.deleteMany({
    where: { clientId, status: { in: ["DRAFT", "APPROVED"] }, scheduledDate: { gte: new Date() } },
  });
  await prisma.client.update({
    where: { id: clientId },
    data: { planStatus: "NOT_GENERATED", generatedUntil: null },
  });
  return res.count;
}