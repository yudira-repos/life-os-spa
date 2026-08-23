import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardDayRoute } from "@/lib/dayos/authz";
import { dayContext, materializeDay, occurrencesForDay } from "@/lib/dayos/service";
import { todayIn, zonedMinuteOfDay } from "@/lib/dayos/time";
import { composeCarpoolMessage, type CarpoolRun } from "@/lib/dayos/carpool";

// The same message the group would get, rendered for a human to read first.
//
// Session-authenticated and side-effect free as far as messaging goes: it
// builds the day and composes the text, but nothing is queued and nothing is
// sent. Reading it before switching broadcasting on is the point.

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await guardDayRoute("VIEW");
  if (!guard.ok) return guard.response;

  const group = await db.coordinationGroup.findFirst({
    where: { householdId: guard.household.id, kind: "CARPOOL" },
    orderBy: { createdAt: "asc" },
  });
  if (!group) {
    return NextResponse.json({ error: "No carpool group yet — save one first." }, { status: 404 });
  }

  const ctx = await dayContext(guard.household.id);
  const day = todayIn(ctx.timeZone, new Date());
  await materializeDay(guard.household.id, day);

  const activities = await db.activity.findMany({
    where: { householdId: guard.household.id, rotation: { groupId: group.id } },
    select: { id: true, carpoolRole: true },
  });
  if (activities.length === 0) {
    return NextResponse.json({
      error:
        "No activities are linked to this group yet. Give an activity a rotation, then set that rotation's group.",
    }, { status: 404 });
  }

  const roleByActivity = new Map(activities.map((a) => [a.id, a.carpoolRole]));
  const rows = await occurrencesForDay(guard.household.id, day);

  const runs: CarpoolRun[] = rows
    .filter((row) => roleByActivity.has(row.activityId))
    .map((row) => ({
      kind: roleByActivity.get(row.activityId) === "PICKUP" ? "PICKUP" : "DROPOFF",
      responsibleName: row.responsibleMember?.name ?? row.responsibleContact?.name ?? null,
      startMinute: zonedMinuteOfDay(row.startAt, ctx.timeZone),
      source: row.assignmentSource,
      cancelled: row.status === "CANCELLED",
      cancelledReason: row.notes,
    }));

  const dayLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(day);

  const message = composeCarpoolMessage({ groupName: group.name, dayLabel, runs });
  return NextResponse.json({ reply_text: message.reply_text, empty: message.empty });
}
