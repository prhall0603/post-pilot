// PostPilot - Local Mode SQLite client STUB.
// The installer (or app boot prep) replaces this folder with the real
// generated Prisma client:
//   npx prisma db push + generate --schema prisma/schema.local.prisma
// Until then, constructing the client surfaces a clear instruction.

"use strict";

function PrismaClient() {
  throw new Error(
    "Local database client not prepared - run the installer (START-APP.bat / .command / .sh) again, or: npx pnpm install && npx prisma db push --schema prisma/schema.local.prisma"
  );
}

module.exports = { PrismaClient: PrismaClient };
