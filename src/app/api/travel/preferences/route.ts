import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardTravelRoute } from "@/lib/travelos/authz";
import { STYLE_LABELS, type DestinationStyle } from "@/lib/travelos/destinations";

export async function PUT(request: Request) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));

  const homeAirport =
    typeof body?.homeAirport === "string" && /^[A-Za-z]{3}$/.test(body.homeAirport.trim())
      ? body.homeAirport.trim().toUpperCase()
      : null;

  if (body?.homeAirport && !homeAirport) {
    return NextResponse.json(
      { error: "Home airport should be a 3-letter IATA code, like SFO." },
      { status: 400 }
    );
  }

  const styles = Array.isArray(body?.preferredStyles)
    ? (body.preferredStyles as string[])
        .map((s) => s.toUpperCase())
        .filter((s): s is DestinationStyle => s in STYLE_LABELS)
    : [];

  const data = {
    homeAirport,
    maxFlightHours: clampInt(body?.maxFlightHours, 1, 20, 6),
    domesticOnly: body?.domesticOnly === true,
    passportsReady: body?.passportsReady === true,
    budgetPerTripCents: Math.max(toInt(body?.budgetPerTripCents, 0), 0),
    preferredStyles: styles.length > 0 ? styles.join(",") : null,
  };

  await db.travelPreferences.upsert({
    where: { householdId: guard.household.id },
    create: { householdId: guard.household.id, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}

function toInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.min(Math.max(toInt(value, fallback), min), max);
}
