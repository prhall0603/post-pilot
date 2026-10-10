// Boot hook: prepares/maintains the database (postgres or Local Mode)
// by running scripts/boot-db.mjs OUTSIDE webpack. The dynamic import is
// assembled at runtime so webpack's edge instrumentation bundle never tries
// to bundle Node builtins (which caused unresolved-module build errors).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Hidden from webpack: resolves real dynamic imports at runtime.
  const dynamicImport = (specifier: string): Promise<any> =>
    new Function("s", "return import(s)")(specifier);

  try {
    const { spawnSync } = (await dynamicImport("child_process")) as typeof import("child_process");
    const boot = spawnSync("node", ["scripts/boot-db.mjs"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    if (boot.status !== 0) {
      console.log("[postpilot-diag] boot-db finished with issues - see output above");
    }
  } catch (e) {
    console.log(
      `[postpilot-diag] boot-db could not run: ${e instanceof Error ? e.message.slice(0, 160) : "unknown"}`
    );
  }
}
