import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardTravelRoute, assertWindowInHousehold } from "@/lib/travelos/authz";
import { DESTINATION_BY_CODE } from "@/lib/travelos/destinations";
import { upsertVacationGoal } from "@/lib/travelos/integrations";
import { inclusiveDayCount, formatRange } from "@/lib/travelos/dates";

// The human-in-the-loop step.
//
// Nothing before this commits the household to anything: windows are
// suggestions, destinations are matches, flight options are cached fares.
// This is where a person says "yes, this one" — and it is the ONLY place a
// trip is created or a savings goal is touched.
//
// It also does not book anything. It records the decision, estimates the cost,
// and hands the money side to FinancialOS. Booking happens on the airline's
// site, by a human, with the real price in front of them.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const window = await assertWindowInHousehold(guard.household.id, id);
  if (!window) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const destinationCode =
    typeof body?.destinationCode === "string" ? body.destinationCode.toUpperCase() : "";
  const destination = DESTINATION_BY_CODE[destinationCode];

  if (!destination) {
    return NextResponse.json(
      { error: "Pick a destination from the suggestions." },
      { status: 400 }
    );
  }

  const flightOptionId = typeof body?.flightOptionId === "string" ? body.flightOptionId : null;
  let flightCents = 0;

  if (flightOptionId) {
    const option = await db.flightOption.findFirst({
      where: { id: flightOptionId, windowId: window.id },
    });
    if (!option) {
      return NextResponse.json({ error: "That flight option is no longer available." }, { status: 404 });
    }
    // Fares are per person. Everyone in the household who'd travel needs a seat.
    const travellers = await db.householdMember.count({
      where: { householdId: guard.household.id, role: { in: ["OWNER", "ADULT", "CHILD"] } },
    });
    flightCents = option.priceCents * Math.max(travellers, 1);
  }

  const days = inclusiveDayCount(window.startDate, window.endDate);
  const groundCents = destination.dailyFamilyCost * days * 100;
  const estimatedCostCents = flightCents + groundCents;

  const trip = await db.trip.create({
    data: {
      householdId: guard.household.id,
      windowId: window.id,
      name: `${destination.name} — ${window.label}`,
      destinationCode: destination.code,
      destinationName: destination.name,
      startDate: window.startDate,
      endDate: window.endDate,
      status: "PLANNING",
      estimatedCostCents,
      notes:
        typeof body?.notes === "string" ? body.notes.trim().slice(0, 500) : null,
    },
  });

  // Attach the chosen flight option to the trip so it survives the next
  // window refresh (which clears unattached options).
  if (flightOptionId) {
    await db.flightOption.update({
      where: { id: flightOptionId },
      data: { tripId: trip.id },
    });
  }

  await db.travelWindow.update({
    where: { id: window.id },
    data: { status: "CONFIRMED" },
  });

  // The loop back to FinancialOS. Null when that module isn't entitled — the
  // trip still stands, there's just no goal attached to it.
  const goal = await upsertVacationGoal({
    householdId: guard.household.id,
    tripId: trip.id,
    tripName: window.label,
    destinationName: destination.name,
    startDate: window.startDate,
    estimatedCostCents,
  });

  return NextResponse.json({
    tripId: trip.id,
    estimatedCostCents,
    breakdown: {
      flightsCents: flightCents,
      groundCents,
      days,
    },
    dates: formatRange(window.startDate, window.endDate),
    savingsGoal: goal,
  });
}
