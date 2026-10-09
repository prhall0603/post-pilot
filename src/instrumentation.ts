// Diagnostic: probe DATABASE_URL, and if auth fails, retry the password
// component with different URI-encoding variants to identify the exact
// connection-string form that works. Logs outcomes only — never credentials.
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
      const raw = e instanceof Error ? e.message : String(e);
      if (/authentication failed|credentials/i.test(raw)) return "AUTH-FAIL";
      if (/timed out|timeout|ENETUNREACH|ECONNREFUSED/i.test(raw)) return "NETWORK-FAIL";
      return "OTHER:" + raw.replace(/\s+/g, " ").slice(0, 120);
    } finally {
      await pc.$disconnect().catch(() => {});
    }
  };

  const u = new URL(url);
  const encoded = u.password; // percent-encoded form as parsed from the URL
  const decoded = decodeURIComponent(u.password);

  // variant 1: standard URL-encoding of every special char
  const v1 = `postgresql://${u.username}:${encodeURIComponent(decoded)}@${u.host}${u.pathname}`;
  // variant 2: fully literal password (no encoding at all)
  const v2 = `postgresql://${u.username}:${decoded.replace(/[@:\/]/g, "")}@${u.host}${u.pathname}`;
  // variant 3: as provided in the file
  const v3 = url;

  const seen = new Set<string>();
  const tries: Array<[string, string]> = [
    ["url-encode-all", v1],
    ["literal", v2],
    ["as-provided", v3],
  ];
  for (const [label, dsUrl] of tries) {
    if (seen.has(`${label}|${dsUrl}`)) continue;
    seen.add(`${label}|${dsUrl}`);
    const result = await probe(dsUrl);
    console.log(`[postpilot-diag] DB probe [${label}]: ${result}`);
    if (result === "OK") {
      console.log(
        `[postpilot-diag] SUCCESS FORM: "${label}" — bake this exact form into .env.local`
      );
      return;
    }
  }
  console.log(
    "[postpilot-diag] All password encoding variants failed with the current credentials. If every result was AUTH-FAIL, the password likely is not set on the database role yet — perform 'Reset database password' in Supabase first."
  );
}