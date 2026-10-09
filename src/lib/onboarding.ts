// Onboarding support: summary migration + demo seeding inside BYO databases.
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/crypto";

/**
 * Copy a registry summary of the workspace into its own database: the agency
 * row (fresh password hash required for that DB's local sessions if anyone
 * inspects it — the control plane remains the source of truth for auth).
 */
export async function seedDemoByoWorkspace(
  agencyId: string,
  email: string,
  label: string
): Promise<void> {
  // Registry summary row (id fixed to the control-plane agency id).
  await prisma.agency.upsert({
    where: { id: agencyId },
    create: { id: agencyId, email, passwordHash: hashPassword("bring-your-own-db"), dbMode: "BYO", dbLabel: label, demoMode: true },
    update: { dbMode: "BYO", dbLabel: label },
  });
  await prisma.ghLConnection.upsert({
    where: { agencyId },
    create: { agencyId, mode: "DEMO", tokenType: "Agency" },
    update: { mode: "DEMO" },
  });
  await prisma.tokenEvent.create({
    data: { agencyId, kind: "connect", detail: `BYO database activated (${label})` },
  });
  // Seed the worked example client so the dashboard is alive after the switch.
  const { seedDemoAgency } = await import("@/lib/ghlDemo");
  await seedDemoAgency({ id: agencyId, dbMode: "BYO" });
}