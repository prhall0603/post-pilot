// Next.js instrumentation — runs once per server process at boot.
// Preview wiring: if DATABASE_URL is missing at boot, Prisma would crash; we
// log which DB-related env keys exist (names only, never values) so wiring
// problems are visible in the dev logs.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __ppInstrLogged?: boolean };
  if (g.__ppInstrLogged) return;
  g.__ppInstrLogged = true;
  try {
    const keys = Object.keys(process.env)
      .filter((k) => /(supabase|database|postgres|postgresql|^pg|pg$)/i.test(k))
      .sort();
    console.log(
      `[postpilot] DB env keys: ${keys.length ? keys.join(", ") : "(none)"} | has DATABASE_URL: ${Boolean(process.env.DATABASE_URL)}`
    );
  } catch {
    /* never block boot */
  }
}