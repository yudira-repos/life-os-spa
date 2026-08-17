import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPropertyRoute } from "@/lib/propertyos/authz";
import { TRADE_LABELS } from "@/lib/propertyos/equipment";

const TRADES = Object.keys(TRADE_LABELS);

export async function POST(request: Request) {
  const guard = await guardPropertyRoute("VIEW");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const vendor = await db.vendor.create({
    data: {
      householdId: guard.household.id,
      name,
      trade: TRADES.includes(body?.trade) ? body.trade : "OTHER",
      phone: str(body?.phone, 40),
      email: str(body?.email, 120),
      website: str(body?.website, 200),
      hourlyRateCents: guard.canManage
        ? Math.max(Math.round(Number(body?.hourlyRateCents) || 0), 0) || null
        : null,
      rating: clampRating(body?.rating),
      notes: str(body?.notes, 400),
    },
  });

  return NextResponse.json({ id: vendor.id });
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

function clampRating(value: unknown): number | null {
  const parsed = Math.round(Number(value) || 0);
  if (!parsed) return null;
  return Math.min(Math.max(parsed, 1), 5);
}
