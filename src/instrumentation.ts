// Diagnostic: probe DATABASE_URL at boot with the full error text so
// connectivity/auth/SSL failures are distinguishable. Names only — never
// credentials. (No node:net — that breaks the edge bundle of instrumentation.)
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[postpilot-diag] DATABASE_URL missing — database features will fail");
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const probe = async (dsUrl: string): Promise<string> => {
    const pc = new PrismaClient({ datasources: { db: { url: dsUrl } }, log: [] });
    try {
      await pc.$queryRaw`SELECT 1`;
      return "OK";
    } catch (e) {
      const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      return raw.replace(/\s+/g, " ").slice(0, 300);
    } finally {
      await pc.$disconnect().catch(() => {});
    }
  };

  const result = await probe(url);
  console.log(`[postpilot-diag] DB probe: ${result}`);
  if (result !== "OK") {
    const withSsl = `${url}${url.includes("?") ? "&" : "?"}sslmode=require`;
    const sslResult = await probe(withSsl);
    console.log(`[postpilot-diag] DB probe with sslmode=require: ${sslResult}`);
  }
}