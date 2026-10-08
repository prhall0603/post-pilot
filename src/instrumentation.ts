// Diagnostic: log which environment variables the dev server actually
// receives at boot (names only — never values) so the Prisma connection can
// be wired to Dyad's injected variable.
export async function register() {
  const keys = Object.keys(process.env);
  const interesting = keys.filter((k) =>
    /db|data|sql|postgres|pg|supa|neon|url|key|token|secret/i.test(k)
  );
  console.log(
    `[postpilot-diag] env vars (${keys.length} total, ${interesting.length} interesting): ${interesting.join(", ")}`
  );
}