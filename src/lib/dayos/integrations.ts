// The entire cross-module surface of DayOS.
//
// Same rule as TravelOS and PropertyOS: no other file in this module reaches
// into another module's tables, calls are one-directional, and every one
// degrades to nothing when the other module isn't entitled. This is the file
// that gets rewritten when a domain event bus finally arrives.

import { db } from "@/lib/db";
import { isEntitled } from "@/lib/entitlements";
import { addDays, startOfDay } from "@/lib/travelos/dates";

/**
 * The days school is out, from TravelOS's CONFIRMED school calendars.
 *
 * This is the integration that earns its keep: without it, DayOS sends a
 * "leave now for school pickup" on a teacher in-service day, which is the
 * single most obvious way to look stupid to a parent. Only CONFIRMED
 * calendars count — a DRAFT is an unreviewed PDF extraction, and skipping a
 * real pickup because a model misread a date is worse than the alternative.
 */
export async function noSchoolDays(
  householdId: string,
  from: Date,
  to: Date
): Promise<Date[]> {
  if (!(await isEntitled(householdId, "travel"))) return [];

  const entries = await db.schoolCalendarEntry.findMany({
    where: {
      calendar: { householdId, status: "CONFIRMED" },
      noSchool: true,
      startDate: { lte: to },
      endDate: { gte: from },
    },
    select: { startDate: true, endDate: true },
  });

  const days: Date[] = [];
  for (const entry of entries) {
    let cursor = startOfDay(entry.startDate);
    const end = startOfDay(entry.endDate);
    // Bounded by the caller's window, so a bad row can't expand forever.
    while (cursor <= end && cursor <= to) {
      if (cursor >= from) days.push(cursor);
      cursor = addDays(cursor, 1);
    }
  }
  return days;
}

/**
 * Children's ACTIVE KidsOS activities, by child, as free text.
 *
 * KidsOS activity rows carry no schedule, so this can only ever be a prompt —
 * "Ayuktha has swimming marked active; is that Tuesdays?" — when a household
 * is setting DayOS up. Presenting it as a known commitment would be inventing
 * a time, and an invented pickup time is the worst output this module has.
 */
export async function suggestedActivitiesForChildren(
  householdId: string
): Promise<{ childId: string; childName: string; activityKeys: string[] }[]> {
  if (!(await isEntitled(householdId, "kids"))) return [];

  const children = await db.householdMember.findMany({
    where: { householdId, role: "CHILD" },
    select: {
      id: true,
      name: true,
      activities: { where: { status: "ACTIVE" }, select: { activityKey: true } },
    },
  });

  return children
    .filter((c) => c.activities.length > 0)
    .map((c) => ({
      childId: c.id,
      childName: c.name,
      activityKeys: c.activities.map((a) => a.activityKey),
    }));
}

/**
 * Whether the household is away on a confirmed trip that day.
 *
 * A family in Hawaii does not need a school pickup reminder. TravelOS knows
 * the dates; DayOS just asks.
 *
 * Only BOOKED counts. A trip sitting in PLANNING is a maybe — somebody sketching
 * a week in Maui must not silently wipe out this week's school run, which is
 * exactly what including PLANNING here used to do.
 */
export async function tripDaysAway(
  householdId: string,
  from: Date,
  to: Date
): Promise<Date[]> {
  if (!(await isEntitled(householdId, "travel"))) return [];

  const trips = await db.trip.findMany({
    where: {
      householdId,
      status: "BOOKED",
      startDate: { lte: to },
      endDate: { gte: from },
    },
    select: { startDate: true, endDate: true },
  });

  const days: Date[] = [];
  for (const trip of trips) {
    let cursor = startOfDay(trip.startDate);
    const end = startOfDay(trip.endDate);
    while (cursor <= end && cursor <= to) {
      if (cursor >= from) days.push(cursor);
      cursor = addDays(cursor, 1);
    }
  }
  return days;
}
