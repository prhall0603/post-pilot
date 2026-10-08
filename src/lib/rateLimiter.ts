// GHL rate limiter: max 5 concurrent GHL calls globally, one serialization
// queue per sub-account (location) so one client's bulk scheduling can't
// starve another's, and exponential backoff on HTTP 429.

const MAX_CONCURRENT = 5;

interface Waiter {
  resolve: () => void;
}

const globalForLimiter = globalThis as unknown as {
  ppActive: number;
  ppWaiters: Waiter[];
  ppLocationQueues: Map<string, Promise<void>>;
  ppRateLimited: number;
  ppActiveByLocation: Map<string, number>;
};

if (!globalForLimiter.ppActive) {
  globalForLimiter.ppActive = 0;
  globalForLimiter.ppWaiters = [];
  globalForLimiter.ppLocationQueues = new Map();
  globalForLimiter.ppRateLimited = 0;
  globalForLimiter.ppActiveByLocation = new Map();
}

function pump() {
  const g = globalForLimiter;
  while (g.ppActive < MAX_CONCURRENT && g.ppWaiters.length > 0) {
    const w = g.ppWaiters.shift()!;
    g.ppActive += 1;
    w.resolve();
  }
}

/**
 * Acquire a global slot bound to a location key. Within a location, calls run
 * one at a time (per-location queue); across locations up to MAX_CONCURRENT.
 */
export async function acquire(locationKey: string): Promise<() => void> {
  const g = globalForLimiter;
  const prev = g.ppLocationQueues.get(locationKey) || Promise.resolve();
  let releaseLocal!: () => void;
  const localGate = new Promise<void>((r) => (releaseLocal = r));
  g.ppLocationQueues.set(locationKey, prev.then(() => localGate));

  await prev.catch(() => {});

  await new Promise<void>((resolve) => {
    g.ppWaiters.push({ resolve });
    pump();
  });
  g.ppActiveByLocation.set(locationKey, (g.ppActiveByLocation.get(locationKey) || 0) + 1);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    g.ppActive = Math.max(0, g.ppActive - 1);
    g.ppActiveByLocation.set(locationKey, Math.max(0, (g.ppActiveByLocation.get(locationKey) || 1) - 1));
    releaseLocal();
    pump();
  };
  return release;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Exponential backoff for 429s: 1s, 2s, 4s, capped, with jitter. */
export function backoffFor(attempt: number): number {
  const base = Math.min(16000, 1000 * 2 ** attempt);
  return base + Math.floor(Math.random() * 250);
}

/** Limiter + queue state for the agency rate-limit dashboard. */
export function limiterStats(): {
  maxConcurrent: number;
  active: number;
  queued: number;
  rateLimitedEvents: number;
  activeByLocation: Array<{ locationId: string; active: number }>;
} {
  const g = globalForLimiter;
  return {
    maxConcurrent: MAX_CONCURRENT,
    active: g.ppActive,
    queued: g.ppWaiters.length,
    rateLimitedEvents: g.ppRateLimited,
    activeByLocation: [...g.ppActiveByLocation.entries()]
      .filter(([, n]) => n > 0)
      .map(([locationId, active]) => ({ locationId, active })),
  };
}

export function noteRateLimited(): void {
  globalForLimiter.ppRateLimited += 1;
}

export { sleep, MAX_CONCURRENT };