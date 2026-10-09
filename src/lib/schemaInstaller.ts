import { PrismaClient } from "@prisma/client";

/**
 * Schema drift protection: ensures the control-plane database has every
 * column/enum the current Prisma client expects. Cheap on every boot
 * (all statements IF NOT EXISTS / dup-guarded). This makes fresh deploys,
 * moved databases, and Dyad test copies self-healing.
 */
export async function ensureControlSchema(client: PrismaClient): Promise<void> {
  const stmts = [
    `DO $$ BEGIN
       ALTER TYPE "GhlMode" ADD VALUE IF NOT EXISTS 'PIT';
     EXCEPTION WHEN undefined_object THEN NULL; END $$;`,
    `DO $$ BEGIN
       CREATE TYPE "GhlMode" AS ENUM ('DEMO','LIVE','PIT');
     EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN
       CREATE TYPE "PostStatus" AS ENUM ('DRAFT','APPROVED','SCHEDULED','FAILED','POSTED');
     EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `DO $$ BEGIN
       CREATE TYPE "PlanStatus" AS ENUM ('NOT_GENERATED','GENERATING','GENERATED');
     EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    `CREATE TABLE IF NOT EXISTS agency (
       id UUID PRIMARY KEY,
       email TEXT UNIQUE NOT NULL,
       "passwordHash" TEXT NOT NULL,
       "demoMode" BOOLEAN NOT NULL DEFAULT true,
       "dbMode" TEXT NOT NULL DEFAULT 'HOSTED',
       "dbUrlEnc" TEXT,
       "dbLabel" TEXT,
       "schemaInstalled" BOOLEAN NOT NULL DEFAULT true,
       "onboarded" BOOLEAN NOT NULL DEFAULT false,
       "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     );`,
    `ALTER TABLE agency ADD COLUMN IF NOT EXISTS "dbMode" TEXT NOT NULL DEFAULT 'HOSTED';`,
    `ALTER TABLE agency ADD COLUMN IF NOT EXISTS "dbUrlEnc" TEXT;`,
    `ALTER TABLE agency ADD COLUMN IF NOT EXISTS "dbLabel" TEXT;`,
    `ALTER TABLE agency ADD COLUMN IF NOT EXISTS "schemaInstalled" BOOLEAN NOT NULL DEFAULT true;`,
    `ALTER TABLE agency ADD COLUMN IF NOT EXISTS "onboarded" BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE agency ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
    `ALTER TABLE agency ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
    `CREATE INDEX IF NOT EXISTS tokenevent_agencyId_createdAt_idx ON tokenevent ("agencyId", "createdAt");`,
  ];
  for (const stmt of stmts) {
    await client.$executeRawUnsafe(stmt).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// BYO (tenant) schema installation — see DDL list below.
// ---------------------------------------------------------------------------

const DDL: string[] = [
  `DO $$ BEGIN
    CREATE TYPE "PostStatus" AS ENUM ('DRAFT','APPROVED','SCHEDULED','FAILED','POSTED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    CREATE TYPE "PlanStatus" AS ENUM ('NOT_GENERATED','GENERATING','GENERATED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    CREATE TYPE "GhlMode" AS ENUM ('DEMO','LIVE','PIT');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  `CREATE TABLE IF NOT EXISTS agency (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "demoMode" BOOLEAN NOT NULL DEFAULT true,
    "dbMode" TEXT NOT NULL DEFAULT 'HOSTED',
    "dbUrlEnc" TEXT,
    "dbLabel" TEXT,
    "schemaInstalled" BOOLEAN NOT NULL DEFAULT true,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tokenHash" TEXT UNIQUE NOT NULL,
    "agencyId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS session_agencyId_idx ON session ("agencyId");`,

  `CREATE TABLE IF NOT EXISTS ghlconnection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "agencyId" UUID UNIQUE NOT NULL,
    mode "GhlMode" NOT NULL DEFAULT 'DEMO',
    "clientId" TEXT,
    "clientSecretEnc" TEXT,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenType" TEXT NOT NULL DEFAULT 'Agency',
    "expiresAt" TIMESTAMPTZ,
    scope TEXT,
    "locationId" TEXT,
    "userId" TEXT,
    "lastRefreshedAt" TIMESTAMPTZ,
    "lastError" TEXT,
    "connectedAt" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS tokenevent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "agencyId" UUID NOT NULL,
    kind TEXT NOT NULL,
    detail TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS tokenevent_agencyId_createdAt_idx ON tokenevent ("agencyId", "createdAt");`,

  `CREATE TABLE IF NOT EXISTS client (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    industry TEXT NOT NULL,
    website TEXT,
    "locationId" TEXT,
    "brandVoice" TEXT NOT NULL DEFAULT 'professional',
    "brandVoiceNotes" TEXT,
    "targetAudience" TEXT,
    "serviceArea" TEXT,
    "logoUrl" TEXT,
    "planStatus" "PlanStatus" NOT NULL DEFAULT 'NOT_GENERATED',
    "generatedUntil" TIMESTAMPTZ,
    "schedulingCursor" TIMESTAMPTZ,
    "aiTokensEstimated" INTEGER NOT NULL DEFAULT 0,
    "aiCostEstimated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agencyId" UUID NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS client_agencyId_idx ON client ("agencyId");`,

  `CREATE TABLE IF NOT EXISTS clientplatform (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "clientId" UUID NOT NULL,
    platform TEXT NOT NULL,
    "cadenceWeekly" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS product (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "clientId" UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS product_clientId_idx ON product ("clientId");`,

  `CREATE TABLE IF NOT EXISTS blackoutdate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "clientId" UUID NOT NULL,
    date DATE NOT NULL,
    reason TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS blackoutdate_clientId_idx ON blackoutdate ("clientId");`,

  `CREATE TABLE IF NOT EXISTS platformaccount (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "clientId" UUID NOT NULL,
    "locationId" TEXT NOT NULL,
    platform TEXT NOT NULL,
    "ghlAccountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "lastSyncedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS platformaccount_clientId_idx ON platformaccount ("clientId");`,

  `CREATE TABLE IF NOT EXISTS scheduledrun (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "clientId" UUID NOT NULL,
    "monthStart" TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    scheduled INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    detail TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS scheduledrun_clientId_idx ON scheduledrun ("clientId");`,

  `CREATE TABLE IF NOT EXISTS post (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "clientId" UUID NOT NULL,
    platform TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    time TEXT NOT NULL DEFAULT '09:00',
    body TEXT NOT NULL,
    "imagePrompt" TEXT,
    "videoScript" TEXT,
    hashtags TEXT,
    status "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "contentTopic" TEXT NOT NULL,
    category TEXT NOT NULL,
    "mediaRequired" BOOLEAN NOT NULL DEFAULT false,
    "ghlAccountId" TEXT,
    "failureReason" TEXT,
    "failureDetail" TEXT,
    "scheduledAttempts" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMPTZ,
    "ghlPostId" TEXT,
    title TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS post_clientId_scheduledDate_idx ON post ("clientId", "scheduledDate");`,
  `CREATE INDEX IF NOT EXISTS post_clientId_status_idx ON post ("clientId", status);`,
  `CREATE INDEX IF NOT EXISTS post_platform_idx ON post (platform);`,

  `CREATE TABLE IF NOT EXISTS mediaasset (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "clientId" UUID NOT NULL,
    kind TEXT NOT NULL,
    "fileName" TEXT,
    url TEXT,
    "ghlUrl" TEXT,
    "ghlMediaId" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "youtubeId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS mediaasset_clientId_idx ON mediaasset ("clientId");`,

  `CREATE TABLE IF NOT EXISTS postmedia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "postId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS postmedia_postId_idx ON postmedia ("postId");`,

  `DO $$ BEGIN
    ALTER TABLE session ADD CONSTRAINT session_agency_fkey FOREIGN KEY ("agencyId") REFERENCES agency(id) ON UPDATE CASCADE ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    ALTER TABLE ghlconnection ADD CONSTRAINT ghlconnection_agency_fkey FOREIGN KEY ("agencyId") REFERENCES agency(id) ON UPDATE CASCADE ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    ALTER TABLE tokenevent ADD CONSTRAINT tokenevent_agency_fkey FOREIGN KEY ("agencyId") REFERENCES agency(id) ON UPDATE CASCADE ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    ALTER TABLE client ADD CONSTRAINT client_agency_fkey FOREIGN KEY ("agencyId") REFERENCES agency(id) ON UPDATE CASCADE ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    ALTER TABLE clientplatform ADD CONSTRAINT clientplatform_client_fkey FOREIGN KEY ("clientId") REFERENCES client(id) ON UPDATE CASCADE ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    ALTER TABLE product ADD CONSTRAINT product_client_fkey FOREIGN KEY ("clientId") REFERENCES client(id) ON UPDATE CASCADE ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    ALTER TABLE blackoutdate ADD CONSTRAINT blackoutdate_client_fkey FOREIGN KEY ("clientId") REFERENCES client(id) ON UPDATE CASCADE ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    ALTER TABLE platformaccount ADD CONSTRAINT platformaccount_client_fkey FOREIGN KEY ("clientId") REFERENCES client(id) ON UPDATE CASCADE ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    ALTER TABLE scheduledrun ADD CONSTRAINT scheduledrun_client_fkey FOREIGN KEY ("clientId") REFERENCES client(id) ON UPDATE CASCADE ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    ALTER TABLE post ADD CONSTRAINT post_client_fkey FOREIGN KEY ("clientId") REFERENCES client(id) ON UPDATE CASCADE ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    ALTER TABLE mediaasset ADD CONSTRAINT mediaasset_client_fkey FOREIGN KEY ("clientId") REFERENCES client(id) ON UPDATE CASCADE ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    ALTER TABLE postmedia ADD CONSTRAINT postmedia_post_fkey FOREIGN KEY ("postId") REFERENCES post(id) ON UPDATE CASCADE ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    ALTER TABLE postmedia ADD CONSTRAINT postmedia_asset_fkey FOREIGN KEY ("mediaAssetId") REFERENCES mediaasset(id) ON UPDATE CASCADE ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
];

const installed = new Set<string>();

/** Install (once per process per URL) the PostPilot schema in a tenant DB. */
export async function installClientSchema(dsUrl: string): Promise<void> {
  if (installed.has(dsUrl)) return;
  const client = new PrismaClient({ datasources: { db: { url: dsUrl } }, log: [] });
  try {
    for (const stmt of DDL) {
      await client.$executeRawUnsafe(stmt);
    }
    installed.add(dsUrl);
  } finally {
    await client.$disconnect().catch(() => {});
  }
}