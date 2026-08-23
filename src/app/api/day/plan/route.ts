import { NextResponse } from "next/server";
import { guardDayRoute } from "@/lib/dayos/authz";
import { db } from "@/lib/db";
import { dayContext, planWindow } from "@/lib/dayos/service";
import { todayIn } from "@/lib/dayos/time";
import { routingEnabled } from "@/lib/dayos/routing";

/**
 * Rebuild today and tomorrow: expand the recurring activities into
 * occurrences, resolve whose turn it is, and price the departures.
 *
 * Idempotent, so the Today page can call it on load without a guard, and a
 * person can hit "recalculate" as often as they like.
 */
export async function POST() {
  const guard = await guardDayRoute("COORDINATE");
  if (!guard.ok) return guard.response;

  const ctx = await dayContext(guard.household.id);
  const now = new Date();
  const results = await planWindow(guard.household.id, todayIn(ctx.timeZone, now), 7, now);

  const created = results.reduce((sum, r) => sum + r.created, 0);
  const updated = results.reduce((sum, r) => sum + r.updated, 0);
  const unassigned = results.reduce((sum, r) => sum + r.unassigned, 0);

  // `created` is 0 on every re-run of an already-planned week, so reporting
  // "no activities are set up yet" off it told a household with a full week of
  // activities that it had none. Ask the activities table instead.
  const activeActivities = await db.activity.count({
    where: { householdId: guard.household.id, status: "ACTIVE" },
  });

  return NextResponse.json({
    days: results.length,
    created,
    updated,
    unassigned,
    // Said out loud rather than left for someone to discover from suspiciously
    // round leave times.
    routing: routingEnabled()
      ? "live"
      : "estimated — set GOOGLE_MAPS_API_KEY for real travel times",
    note:
      activeActivities === 0
        ? "No activities are set up yet. Add one to start getting leave times."
        : created === 0 && updated === 0
          ? "Nothing falls in the next 7 days — check which weekdays your activities run on."
          : unassigned > 0
            ? `${unassigned} occurrence${unassigned === 1 ? "" : "s"} in the next week have nobody assigned.`
            : undefined,
  });
}
