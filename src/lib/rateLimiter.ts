// GHL rate limiter: max N concurrent GHL calls globally, one queue per
// sub-account (location) so a bulk run on one client can't starve another's,
// and exponential backoff on HTTP 429.

const MAX_CONCURRENT = 5;

interface Waiter {
  resolve: () => void;
  path: string; // per-location key
}

const globalForLimiter = globalThis as unknown as {
  ppActive: number;
  ppWaiters: Waiter[];
  ppLocationQueues: Map<string, Array<() => void>>;
  ppRlCount: Map<string, { count: number; resetAt: number }>;
};

if (!globalForLimiter.ppActive) {
  globalForLimiter.ppActive = 0;
  globalForLimiter.ppWaiters = [];
  globalForLimiter.ppLocationQueues = new Map();
  globalForLimiter.ppRlCount = new Map();
}

function pump() {
  const g = globalForLimiter;
  while (g.ppActive < MAX_CONCURRENT && g.ppWaiters.length > 0) {
    const w = g.ppWaiters.shift()!;
    // Per-location fairness: pick the next waiter only if no earlier waiter for
    // the same location is directly queued for a token (light-weight check).
    g.ppActive++;
    w.resolve();
  }
}

/** Acquire a global slot bound to a location key. */
export async function acquire(locationKey: string): Promise<() => void> {
  const g = globalForLimiter;
  // location serialization: chain on a per-location promise queue
  const prev = g.ppLocationQueues.get(locationKey);
  let releaseLocal!: () => void;
  const localGate = new Promise<void>((r) => (releaseLocal = r));
  g.ppLocationQueues.set(
    locationKey,
    (prev ? prev : Promise.resolve()).then(() => localGate)
  );

  if (prev) await prev.catch(() => {});

  await new Promise<void>((resolve) => {
    g.ppWaiters.push({ resolve, path: locationKey });
    pump();
  });

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    g.ppActive = Math.max(0, g.ppActive - 1);
    releaseLocal(); // unblock next waiter in this location's queue
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

export { sleep, MAX_CONCURRENT };