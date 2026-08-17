import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPropertyRoute } from "@/lib/propertyos/authz";
import { getPrimaryProperty } from "@/lib/propertyos/service";
import { detectHomeBills } from "@/lib/propertyos/detect";
import { addDays, startOfDay } from "@/lib/travelos/dates";
import { CADENCE_MONTHS, nextTaxDeadline, type Cadence } from "@/lib/propertyos/bills";

// Adopt a detected recurring charge as a tracked bill.
//
// The detection is re-run server-side rather than trusting the posted payload.
// Otherwise this endpoint would happily create a "bill" from whatever amount
// and cadence a client claimed — and the numbers here drive reminders and the
// cost-of-ownership rollup.

export async function POST(request: Request) {
  const guard = await guardPropertyRoute("MANAGE");
  if (!guard.ok) return guard.response;

  const property = await getPrimaryProperty(guard.household.id);
  if (!property) {
    return NextResponse.json(
      { error: "Add your property details first." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const key = typeof body?.key === "string" ? body.key : "";
  if (!key) return NextResponse.json({ error: "Which one?" }, { status: 400 });

  const detected = await detectHomeBills(guard.household.id);
  const match = detected.find((bill) => bill.key === key);
  if (!match) {
    return NextResponse.json(
      { error: "That charge is no longer in the detected list — it may already be tracked." },
      { status: 404 }
    );
  }

  // Next due: one cadence period on from the last charge we saw.
  const months = CADENCE_MONTHS[match.suggestedCadence as Cadence] ?? 1;
  const lastCharged = startOfDay(match.lastChargedAt);
  let nextDueDate =
    months > 0
      ? new Date(
          Date.UTC(
            lastCharged.getUTCFullYear(),
            lastCharged.getUTCMonth() + months,
            lastCharged.getUTCDate()
          )
        )
      : addDays(lastCharged, 30);

  if (match.category === "PROPERTY_TAX") {
    nextDueDate = nextTaxDeadline(property.stateCode)?.date ?? nextDueDate;
  }

  const bill = await db.propertyBill.create({
    data: {
      propertyId: property.id,
      householdId: guard.household.id,
      name: match.suggestedName,
      category: match.category,
      cadence: match.suggestedCadence,
      typicalAmountCents: match.typicalAmountCents,
      nextDueDate,
      detectedKey: match.key,
      lastPaidAt: match.lastChargedAt,
      lastPaidCents: match.typicalAmountCents,
      notes: match.cadenceCertain
        ? null
        : `Adopted from your transactions, but the spacing between charges (about ${match.averageIntervalDays} days) didn't match a standard cadence cleanly — check that "${match.suggestedCadence}" is right.`,
    },
  });

  return NextResponse.json({
    id: bill.id,
    cadenceCertain: match.cadenceCertain,
    nextDueDate,
  });
}
