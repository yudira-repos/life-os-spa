import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardTravelRoute, assertTripInHousehold } from "@/lib/travelos/authz";

const STATUSES = ["PLANNING", "BOOKED", "COMPLETED", "CANCELLED"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const trip = await assertTripInHousehold(guard.household.id, id);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (STATUSES.includes(body?.status)) data.status = body.status;
  if (typeof body?.name === "string" && body.name.trim()) {
    data.name = body.name.trim().slice(0, 160);
  }
  if (typeof body?.notes === "string") data.notes = body.notes.trim().slice(0, 500) || null;
  if (typeof body?.estimatedCostCents === "number") {
    data.estimatedCostCents = Math.max(Math.round(body.estimatedCostCents), 0);
  }

  await db.trip.update({ where: { id: trip.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const trip = await assertTripInHousehold(guard.household.id, id);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The savings goal is deliberately NOT deleted. Money set aside for a
  // cancelled trip is still money set aside — deleting the goal because a
  // plan changed would be a surprising thing for this module to do to
  // someone's finances. Unlink and leave it.
  await db.trip.delete({ where: { id: trip.id } });

  if (trip.windowId) {
    await db.travelWindow.updateMany({
      where: { id: trip.windowId, status: "CONFIRMED" },
      data: { status: "SHORTLISTED" },
    });
  }

  return NextResponse.json({
    ok: true,
    savingsGoalKept: Boolean(trip.savingsGoalId),
  });
}
