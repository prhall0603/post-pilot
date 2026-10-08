// AI content generation via Ollama (OpenAI-compatible endpoint).
// One API call per month (12 batches for a year), with per-batch retry.

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

const AI_BASE_URL = process.env.AI_BASE_URL || "https://api.ollama.com/v1";
const AI_MODEL = process.env.AI_MODEL || "gpt-oss:120b";
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
// Demo AI — templated local "generation" used when AI_API_KEY is absent so the
// whole flow remains testable in Demo Mode.
// ---------------------------------------------------------------------------

const DEMO_TOPICS: Record<Category, string[]> = {
  educational: ["How {service} works", "Common mistakes to avoid", "A quick explainer", "What to expect step by step"],
  promotional: ["Current offer", "Seasonal promotion", "Featured service spotlight", "Limited-time deal"],
  social_proof: ["Customer story", "A recent project", "What clients say", "Results spotlight"],
  local_community: ["Neighborhood roundup", "Local event spotlight", "Community involvement", "Area guide"],
  holiday_seasonal: ["Seasonal tips", "Holiday hours", "Celebrating the season", "Year-end wrap-up"],
  behind_the_scenes: ["Meet the team", "How we prep a job", "A day in the life", "Tool talk"],
};

function demoGenerate(
  client: { name: string; industry: string; serviceArea?: string | null },
  platform: PlatformId,
  category: Category,
  month: Date,
  i: number
) {
  const topics = DEMO_TOPICS[category];
  const topic = topics[i % topics.length]
    .replace("{service}", "our " + client.industry.toLowerCase() + " service")
    .replace("our ", "the ");
  const m = monthName(month).split(" ")[0];
  const rules = PLATFORM_RULES[platform];
  let body = `${client.name} is here with a fresh thought for ${m}: ${topic}.\n\nAs a ${client.industry.toLowerCase()} business${client.serviceArea ? ` serving ${client.serviceArea}` : ""}, the team focuses on doing things the right way. This month the spotlight is on ${topic.toLowerCase()} — [PLACEHOLDER: short supporting detail from the team].\n\nReach out to learn more.`;
  if (category === "promotional") {
    body = `A deal worth talking about at ${client.name}.\n\n[PLACEHOLDER: current offer details] — valid through ${m}. Contact the team to book.`;
  }
  if (category === "social_proof") {
    body = `Clients of ${client.name} keep the team motivated. [PLACEHOLDER: customer name], a recent [PLACEHOLDER: service type] client, shared [PLACEHOLDER: testimonial snippet]. Proud to serve.`;
  }
  if (platform === "twitter") body = `${client.name}: ${topic}. [PLACEHOLDER: detail]`;
  if (platform === "gbp") body = `${client.name} — ${topic}. [PLACEHOLDER: short local update detail for customers in ${client.serviceArea || "the area"}].`;
  if (rules.videoFirst) body = `In this video, ${client.name} walks through ${topic.toLowerCase()}. [PLACEHOLDER: key takeaway]. Subscribe for more.`;
  if (platform === "youtube") body = `What you'll see: ${topic.toLowerCase()} from start to finish, plus what to expect when you work with a local ${(client.industry || "").toLowerCase()} team.`;
  return { body, topic };
}

function hashtagsFor(platform: PlatformId, client: { industry: string; serviceArea?: string | null }): string {
  if (platform === "gbp") return ""; // no hashtag emphasis
  const base = client.industry.toLowerCase().replace(/[^a-z]+/g, "");
  return ["#" + base, "#localbusiness", "#tips"].join(" ");
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
  const TIMES = ["09:00", "11:30", "15:00", "17:30", "19:00", "08:00", "13:00"];
  for (const { platform, cadenceWeekly } of platforms) {
    const total = Math.max(1, Math.round(weeks * cadenceWeekly));
    const mix = mixForPlatform(platform);
    const weights: Record<string, number> = {};
    for (const c of CATEGORIES) weights[c] = mix[c];
    const counts = largestRemainder(total, weights);
    // clamp promotional to 20% of the platform's total for the month
    if (counts.promotional > Math.ceil(total * 0.2)) {
      const excess = counts.promotional - Math.floor(total * 0.2);
      counts.promotional = Math.floor(total * 0.2);
      counts.educational = (counts.educational || 0) + excess;
    }
    for (const cat of CATEGORIES) {
      for (let i = 0; i < (counts[cat] || 0); i++) {
        const idx = slots.length;
        let day = Math.min(dim, 1 + Math.floor(((idx + 1) * dim) / Math.max(1, total)));
        // dodge blackout dates: roll forward up to 5 days
        for (let shift = 0; shift < 5 && blackoutDays.has(day); shift++) {
          day = day === dim ? 2 : day + 1;
        }
        const time = TIMES[(idx * 3 + day) % TIMES.length];
        slots.push({ platform, category: cat, day, time });
      }
    }
  }
  slots.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  return slots;
}

// ---------------------------------------------------------------------------
// Month generation — one AI call per month, retried on failure
// ---------------------------------------------------------------------------

interface GeneratedItem {
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
  slots: Slot[],
  recentTopics: string[]
): string {
  const rules = client.platforms
    .map((p) => {
      const r = PLATFORM_RULES[p.platform];
      return `- ${r.name} (${p.platform}): max ${r.maxLen} chars, media ${r.mediaRequired ? "REQUIRED" : "optional"}${r.videoRequired ? ", video REQUIRED" : ""}${r.noHashtagEmphasis ? ", do NOT include hashtags" : ""}${p.platform === "youtube" ? ", write a title too" : ""}`;
    })
    .join("\n");
  const slotLines = slots
    .map(
      (s, idx) =>
        `${idx}. { "platform": "${s.platform}", "category": "${s.category}", "day": ${s.day}, "time": "${s.time}" } with body, hashtags${PLATFORM_RULES[s.platform].mediaRequired ? ", imagePrompt or videoScript" : ""}`
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
- NEVER invent statistics, percentages, dollar results, testimonials, awards, or years in business. Where a real number or testimonial would go, write [PLACEHOLDER: description] instead. The reviewer will fill these in before approval.
- ${client.blackouts.length ? `Do NOT create posts about these closed dates: ${client.blackouts.join(", ")}.` : "No blackout constraints."}
${client.recentTopics.length ? `- Avoid repeating these recent topics: ${client.recentTopics.slice(0, 30).join("; ")}` : ""}
PLATFORM CONSTRAINTS
${rules}
- Google Business Profile body must stay under 1200 chars and describes a local update, event, or offer. Do not include hashtags for GBP.
- Twitter/X bodies must fit 280 chars including hashtags; write punchy one-liners.
- YouTube: "title" (max 90 chars) plus "body" as the video description; "videoScript" with shot list ALWAYS.
- TikTok: short punchy body; "videoScript" with shot list ALWAYS.
- Instagram: "imagePrompt" (vivid photo idea) ALWAYS (or videoScript).

Return ONLY JSON in this exact shape — one item per slot, same count and order:
{ "items": [ { "platform", "category", "day", "time", "title" (YouTube only), "body", "hashtags" (not for GBP), "imagePrompt" (Instagram always; others when an image fits), "videoScript" (video platforms), "gbpPostType" ("update"|"event"|"offer", GBP only) } ] }

SLOTS
${slotLines}`;
}

interface ClientLike {
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
  items: Array<GeneratedItem>;
  tokensUsed: number;
  mode: "ai" | "demo";
}

export async function generateMonth(
  client: ClientLike,
  month: Date
): Promise<GenerateMonthResult> {
  const blackoutDays = new Set<number>();
  const slots = planSlots(client.platforms, month, blackoutDays);
  const prompt = buildPrompt(client, month, slots, client.recentTopics);

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (!process.env.AI_API_KEY) {
        // Demo Mode AI: deterministic templated content so the flow works end-to-end.
        const items: GeneratedItem[] = slots.map((s, idx) => {
          const { body, topic } = demoGenerate(
            { name: client.name, industry: client.industry, serviceArea: client.serviceArea },
            s.platform,
            s.category,
            month,
            idx + s.day
          );
          const rules = PLATFORM_RULES[s.platform];
          const hashtags = hashtagsFor(s.platform, client);
          return {
            platform: s.platform,
            category: s.category,
            day: s.day,
            time: s.time,
            title: s.platform === "youtube" ? `${topic} | ${client.name}` : undefined,
            body: trimForPlatform(s.platform, body),
            hashtags: rules.noHashtagEmphasis ? "" : hashtags,
            imagePrompt:
              s.platform === "instagram" || (!rules.videoFirst && s.category !== "promotional")
                ? `Authentic photo for ${client.name}: ${topic}`
                : s.platform === "instagram"
                  ? "Vibrant photo"
                  : undefined,
            videoScript: rules.videoFirst
              ? `Shot list for "${topic}": 1) Opening hook — team member greets camera. 2) Show the ${client.industry.toLowerCase()} work in progress. 3) Close-up detail shot. 4) [PLACEHOLDER: customer quote b-roll]. 5) Outro with logo and call to action.`
              : undefined,
            gbpPostType: s.platform === "gbp" ? (s.category === "promotional" ? "offer" : s.category === "local_community" ? "event" : "update") : undefined,
          };
        });
        return { items, tokensUsed: estimateTokens(prompt + JSON.stringify(items).length), mode: "demo" };
      }

      const { content, tokens } = await chat([
        { role: "system", content: "You are a senior social media strategist who writes platform-tailored, third-person brand copy. Output only valid JSON." },
        { role: "user", content: prompt },
      ]);
      const parsed = extractJson(content) as { items?: unknown };
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
        throw new Error("AI returned no items");
      }
      const items: GeneratedItem[] = (parsed.items as Array<Record<string, unknown>>).map((it, i) => {
        const platform = String(it.platform || slots[i]?.platform || "");
        if (!isPlatformId(platform)) throw new Error(`Bad platform ${platform}`);
        const category = (CATEGORIES as readonly string[]).includes(String(it.category))
          ? (String(it.category) as Category)
          : "educational";
        const rules = PLATFORM_RULES[platform];
        const body = trimForPlatform(platform, String(it.body || ""));
        return {
          platform,
          category,
          day: Math.max(1, Math.min(daysInMonth(month), Number(it.day) || slots[i]?.day || 1)),
          time: /^\d{2}:\d{2}$/.test(String(it.time || "")) ? String(it.time) : slots[i]?.time || "09:00",
          title: it.title ? String(it.title).slice(0, 100) : undefined,
          body,
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

/** Generate a full 12-month plan in monthly batches, persisting as it goes. */
export async function generateYearPlan(
  clientId: string,
  months = 12,
  onProgress?: (current: number, total: number, label: string) => void
): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      platforms: true,
      products: true,
      blackoutDates: true,
      posts: { select: { contentTopic: true }, orderBy: { scheduledDate: "desc" }, take: 40 },
    },
  });
  if (!client) throw new Error("Client not found");
  const clientLike: ClientLike = {
    name: client.name,
    industry: client.industry,
    website: client.website,
    brandVoice: client.brandVoice,
    brandVoiceNotes: client.brandVoiceNotes,
    targetAudience: client.targetAudience,
    serviceArea: client.serviceArea,
    products: client.products.slice(0, 8).map((p) => ({ name: p.name, description: p.description })),
    platforms: client.platforms
      .filter((p): p is typeof p & { platform: PlatformId } => isPlatformId(p.platform))
      .map((p) => ({ platform: p.platform, cadenceWeekly: p.cadenceWeekly })),
    blackouts: client.blackoutDates.map((b) => `${b.date.toISOString().slice(0, 10)} (${b.reason})`),
    recentTopics: client.posts.map((p) => p.contentTopic),
  };
  if (clientLike.platforms.length === 0) throw new Error("No platforms selected");

  await prisma.client.update({ where: { id: clientId }, data: { planStatus: "GENERATING" } });
  const start =
    client.generatedUntil && client.generatedUntil >= new Date(Date.UTC(2020, 0, 1))
      ? addMonths(firstOfMonth(client.generatedUntil), 1)
      : firstOfMonth(new Date());

  let tokens = 0;
  try {
    for (let m = 0; m < months; m++) {
      const month = addMonths(start, m);
      onProgress?.(m + 1, months, `Generating ${monthName(month)}... ${m + 1}/${months}`);
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
          it.title ||
          (it.body.split("\n")[0] || "").slice(0, 60) ||
          it.category,
        category: it.category,
        mediaRequired: PLATFORM_RULES[it.platform].mediaRequired,
      }));
      await prisma.post.createMany({ data: rows });
      await prisma.client.update({
        where: { id: clientId },
        data: { generatedUntil: month },
      });
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
    await prisma.client.update({ where: { id: clientId }, data: { planStatus: "GENERATED" } });
    throw e;
  } finally {
    onProgress?.(months, months, "Done");
  }
}

/** Delete unscheduled drafts from a date on (cadence change), then regenerate. */
export async function regenerateRemaining(clientId: string): Promise<void> {
  await prisma.post.deleteMany({
    where: { clientId, status: { in: ["DRAFT", "APPROVED"] }, scheduledDate: { gte: new Date() } },
  });
  await prisma.client.update({ where: { id: clientId }, data: { planStatus: "NOT_GENERATED", generatedUntil: null } });
  await generateYearPlan(clientId, 12);
}