import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardTravelRoute, assertCalendarInHousehold } from "@/lib/travelos/authz";
import { parseDay } from "@/lib/travelos/dates";
import { classifyTitle } from "@/lib/travelos/calendar/parse";

// The review step. This is where a human corrects what was extracted.
//
// Editing an entry marks it `confirmed` and flips its source to MANUAL — the
// record then says a person put that date there, which is exactly what you
// want to know six months later when a trip is booked around it.

const KINDS = [
  "BREAK",
  "HOLIDAY",
  "TEACHER_DAY",
  "EARLY_RELEASE",
  "FIRST_DAY",
  "LAST_DAY",
  "OTHER",
] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const calendar = await assertCalendarInHousehold(guard.household.id, id);
  if (!calendar) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
  const startDate = parseDay(body?.startDate);
  const endDate = parseDay(body?.endDate) ?? startDate;

  if (!title || !startDate || !endDate) {
    return NextResponse.json({ error: "Title and dates are required." }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });
  }

  const fallback = classifyTitle(title);
  const kind = KINDS.includes(body?.kind) ? body.kind : fallback.kind;

  const entry = await db.schoolCalendarEntry.create({
    data: {
      calendarId: calendar.id,
      title,
      startDate,
      endDate,
      kind,
      noSchool: typeof body?.noSchool === "boolean" ? body.noSchool : fallback.noSchool,
      source: "MANUAL",
      confirmed: true,
    },
  });

  return NextResponse.json({ id: entry.id });
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
  const entryId = typeof body?.entryId === "string" ? body.entryId : "";

  const entry = await db.schoolCalendarEntry.findFirst({
    where: { id: entryId, calendarId: calendar.id },
  });
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const data: Record<string, unknown> = { confirmed: true };
  let edited = false;

  if (typeof body?.title === "string" && body.title.trim()) {
    data.title = body.title.trim().slice(0, 120);
    edited = true;
  }
  const startDate = parseDay(body?.startDate);
  if (startDate) {
    data.startDate = startDate;
    edited = true;
  }
  const endDate = parseDay(body?.endDate);
  if (endDate) {
    data.endDate = endDate;
    edited = true;
  }
  if (KINDS.includes(body?.kind)) {
    data.kind = body.kind;
    edited = true;
  }
  if (typeof body?.noSchool === "boolean") {
    data.noSchool = body.noSchool;
    edited = true;
  }

  const finalStart = (data.startDate as Date) ?? entry.startDate;
  const finalEnd = (data.endDate as Date) ?? entry.endDate;
  if (finalEnd < finalStart) {
    return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });
  }

  // A human touched it, so it's no longer a model's guess.
  if (edited) data.source = "MANUAL";

  await db.schoolCalendarEntry.update({ where: { id: entry.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const calendar = await assertCalendarInHousehold(guard.household.id, id);
  if (!calendar) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get("entryId") ?? "";

  const entry = await db.schoolCalendarEntry.findFirst({
    where: { id: entryId, calendarId: calendar.id },
  });
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  await db.schoolCalendarEntry.delete({ where: { id: entry.id } });
  return NextResponse.json({ ok: true });
}
