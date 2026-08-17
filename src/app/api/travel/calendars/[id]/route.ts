import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardTravelRoute, assertCalendarInHousehold } from "@/lib/travelos/authz";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const calendar = await assertCalendarInHousehold(guard.household.id, id);
  if (!calendar) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.schoolCalendar.delete({ where: { id: calendar.id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const calendar = await assertCalendarInHousehold(guard.household.id, id);
  if (!calendar) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) {
    data.name = body.name.trim().slice(0, 120);
  }
  if (typeof body?.schoolName === "string") {
    data.schoolName = body.schoolName.trim().slice(0, 120) || null;
  }

  await db.schoolCalendar.update({ where: { id: calendar.id }, data });
  return NextResponse.json({ ok: true });
}
