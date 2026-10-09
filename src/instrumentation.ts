// Boot diagnostics + control-plane schema self-healing.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const [{ PrismaClient }, { ensureControlSchema }, { DATABASE_URL }] = await Promise.all([
      import("@prisma/client"),
      import("@/lib/schemaInstaller"),
      import("@/lib/prisma"),
    ]);
    if (DATABASE_URL) {
      const client = new PrismaClient({ datasources: { db: { url: DATABASE_URL } }, log: [] });
      await ensureControlSchema(client);
      await client.$disconnect().catch(() => {});
      console.log("[postpilot-diag] control schema ensured");
    } else {
      console.log("[postpilot-diag] DATABASE_URL missing — database features will fail");
    }
  } catch (e) {
    console.log(
      `[postpilot-diag] schema ensure failed: ${e instanceof Error ? e.message.slice(0, 160) : "unknown"}`
    );
  }
}