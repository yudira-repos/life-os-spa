import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardTravelRoute } from "@/lib/travelos/authz";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const blackout = await db.blackoutPeriod.findFirst({
    where: { id, householdId: guard.household.id },
  });
  if (!blackout) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.blackoutPeriod.delete({ where: { id: blackout.id } });
  return NextResponse.json({ ok: true });
}
