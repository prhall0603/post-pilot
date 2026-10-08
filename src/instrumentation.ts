export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const url = process.env.DATABASE_URL;
    console.log(
      "[db] DATABASE_URL present:",
      Boolean(url),
      url ? url.replace(/\/\/([^:]+):[^@]*@/, "//$1:***@") : ""
    );
    if (!url) {
      console.log("[db] env keys:", Object.keys(process.env).filter((k) => /DATABASE|SUPABASE|POSTGRES/i.test(k)).join(","));
      return;
    }
    try {
      const { PrismaClient } = await import("@prisma/client");
      const p = new PrismaClient();
      await p.$queryRaw`SELECT 1`;
      console.log("[db] DB_OK");
      const agencies = await p.agency.count();
      console.log("[db] agencies:", agencies);
      await p.$disconnect();
    } catch (e) {
      console.log("[db] DB_ERR", e instanceof Error ? e.message : String(e));
    }
  }
}