import { NextResponse } from "next/server";

export async function GET() {
  const keys = [
    "DATABASE_URL",
    "AI_API_KEY",
    "AI_BASE_URL",
    "GHL_CLIENT_ID",
    "GHL_CLIENT_SECRET",
    "GHL_REDIRECT_URI",
    "ENCRYPTION_KEY",
  ];
  const present = Object.fromEntries(keys.map((k) => [k, Boolean(process.env[k])]));
  return NextResponse.json({ ok: true, present });
}