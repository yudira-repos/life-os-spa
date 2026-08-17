import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardTravelRoute, assertCalendarInHousehold } from "@/lib/travelos/authz";
import { regenerateWindows } from "@/lib/travelos/service";

// The gate between "some dates a model read off a PDF" and "dates this family
// will book flights around".
//
// A calendar cannot be confirmed while any entry is still unreviewed. That's
// the entire point of the DRAFT state — without this check the review step is
// decorative.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardTravelRoute("PLAN");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const calendar = await assertCalendarInHousehold(guard.household.id, id);
  if (!calendar) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const unreviewed = await db.schoolCalendarEntry.count({
    where: { calendarId: calendar.id, confirmed: false },
  });

  if (unreviewed > 0) {
    return NextResponse.json(
      {
        error: `${unreviewed} ${unreviewed === 1 ? "date hasn't" : "dates haven't"} been reviewed yet. Check each one before confirming — a wrong date here becomes a wrong flight later.`,
        unreviewed,
      },
      { status: 409 }
    );
  }

  const total = await db.schoolCalendarEntry.count({ where: { calendarId: calendar.id } });
  if (total === 0) {
    return NextResponse.json(
      { error: "This calendar has no dates in it." },
      { status: 409 }
    );
  }

  await db.schoolCalendar.update({
    where: { id: calendar.id },
    data: { status: "CONFIRMED" },
  });

  // A newly confirmed calendar changes every window, so regenerate now rather
  // than leaving the user on a stale list.
  const result = await regenerateWindows(guard.household.id);

  return NextResponse.json({
    ok: true,
    windowsFound: result.windows.length,
    childrenCovered: result.childrenCovered,
  });
}
