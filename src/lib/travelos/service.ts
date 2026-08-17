import { db } from "@/lib/db";
import { addDays, startOfDay, today } from "@/lib/travelos/dates";
import {
  generateWindows,
  WINDOW_ENGINE_VERSION,
  type ChildCalendarInput,
  type TravelWindow as EngineWindow,
} from "@/lib/travelos/windows";
import { activityConflictsFor } from "@/lib/travelos/integrations";
import { matchDestinations, parseStyles, type DestinationMatch } from "@/lib/travelos/destinations";
import { assessSeason } from "@/lib/travelos/seasonality";

// The layer between the pure engine and the database.
//
// windows.ts is deliberately database-free so it can be tested with a
// hand-written household. This file loads the real data, calls it, and
// persists the result — and keeps one piece of state across regenerations:
// a window's `status`. Everything else is recomputed, but SHORTLISTED and
// DISMISSED are human decisions, and regenerating shouldn't undo them.

export function ageFromBirthdate(birthdate: Date | null): number | null {
  if (!birthdate) return null;
  return Math.floor(
    (Date.now() - birthdate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
}

export async function loadChildCalendars(
  householdId: string
): Promise<ChildCalendarInput[]> {
  // Only CONFIRMED calendars feed the engine. A DRAFT is an unreviewed
  // extraction, and planning a trip around an unreviewed date is exactly what
  // the review step exists to prevent.
  const calendars = await db.schoolCalendar.findMany({
    where: { householdId, status: "CONFIRMED" },
    include: {
      entries: true,
      children: { include: { child: { select: { id: true, name: true } } } },
    },
  });

  const byChild = new Map<string, ChildCalendarInput>();

  for (const calendar of calendars) {
    const entries = calendar.entries.map((entry) => ({
      startDate: entry.startDate,
      endDate: entry.endDate,
      title: entry.title,
      kind: entry.kind,
      noSchool: entry.noSchool,
    }));

    for (const link of calendar.children) {
      const existing = byChild.get(link.child.id);
      if (existing) {
        existing.entries.push(...entries);
      } else {
        byChild.set(link.child.id, {
          childId: link.child.id,
          childName: link.child.name,
          entries: [...entries],
        });
      }
    }
  }

  return [...byChild.values()];
}

export interface RegenerateResult {
  windows: EngineWindow[];
  created: number;
  updated: number;
  childrenCovered: number;
}

export async function regenerateWindows(householdId: string): Promise<RegenerateResult> {
  const [children, adults, blackouts, conflicts] = await Promise.all([
    loadChildCalendars(householdId),
    db.householdMember.findMany({
      where: { householdId, role: { in: ["OWNER", "ADULT"] } },
      include: { travelAvailability: true },
    }),
    db.blackoutPeriod.findMany({
      where: { householdId },
      include: { member: { select: { name: true } } },
    }),
    activityConflictsFor(householdId),
  ]);

  const windows = generateWindows({
    children,
    adults: adults.map((adult) => ({
      memberId: adult.id,
      name: adult.name,
      ptoDaysRemaining: adult.travelAvailability?.ptoDaysRemaining ?? 15,
    })),
    blackouts: blackouts.map((blackout) => ({
      memberId: blackout.memberId,
      memberName: blackout.member?.name ?? undefined,
      startDate: blackout.startDate,
      endDate: blackout.endDate,
      reason: blackout.reason,
    })),
    activityConflicts: conflicts.map((conflict) => ({
      childId: conflict.childId,
      childName: conflict.childName,
      label: conflict.label,
      startDate: conflict.startDate,
      endDate: conflict.endDate,
    })),
  });

  let created = 0;
  let updated = 0;

  for (const window of windows) {
    const existing = await db.travelWindow.findUnique({
      where: {
        householdId_startDate_endDate: {
          householdId,
          startDate: window.startDate,
          endDate: window.endDate,
        },
      },
    });

    const data = {
      label: window.label,
      totalDays: window.totalDays,
      schoolDaysMissed: window.schoolDaysMissed,
      ptoDaysRequired: window.ptoDaysRequired,
      score: window.score,
      seasonLabel: window.season,
      reasons: window.reasons,
      conflicts: window.conflicts,
      engineVersion: WINDOW_ENGINE_VERSION,
      generatedAt: new Date(),
    };

    if (existing) {
      // `status` is left alone on purpose — it's the human's decision.
      await db.travelWindow.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await db.travelWindow.create({
        data: {
          householdId,
          startDate: window.startDate,
          endDate: window.endDate,
          ...data,
        },
      });
      created += 1;
    }
  }

  // Clear out stale SUGGESTED windows that no longer exist (a calendar was
  // corrected, a break moved). Anything a human touched survives.
  const liveKeys = new Set(
    windows.map((w) => `${w.startDate.toISOString()}|${w.endDate.toISOString()}`)
  );
  const stored = await db.travelWindow.findMany({
    where: { householdId, status: "SUGGESTED" },
    select: { id: true, startDate: true, endDate: true },
  });
  const stale = stored.filter(
    (w) => !liveKeys.has(`${w.startDate.toISOString()}|${w.endDate.toISOString()}`)
  );
  if (stale.length > 0) {
    await db.travelWindow.deleteMany({ where: { id: { in: stale.map((w) => w.id) } } });
  }

  return { windows, created, updated, childrenCovered: children.length };
}

export interface WindowSuggestion {
  destinations: DestinationMatch[];
  season: ReturnType<typeof assessSeason>;
}

/** Destination matches for a stored window. Pure — no flight prices yet. */
export async function suggestDestinations(
  householdId: string,
  window: { startDate: Date; endDate: Date; totalDays: number }
): Promise<WindowSuggestion> {
  const [preferences, children] = await Promise.all([
    db.travelPreferences.findUnique({ where: { householdId } }),
    db.householdMember.findMany({
      where: { householdId, role: "CHILD" },
      select: { birthdate: true },
    }),
  ]);

  const season = assessSeason(window.startDate, window.endDate);
  const childAges = children
    .map((child) => ageFromBirthdate(child.birthdate))
    .filter((age): age is number => age != null);

  const destinations = matchDestinations({
    startDate: window.startDate,
    endDate: window.endDate,
    totalDays: window.totalDays,
    season: season.season,
    childAges,
    preferredStyles: parseStyles(preferences?.preferredStyles),
    maxFlightHours: preferences?.maxFlightHours,
    domesticOnly: preferences?.domesticOnly,
    passportsReady: preferences?.passportsReady,
    budgetPerTripCents: preferences?.budgetPerTripCents,
  });

  return { destinations, season };
}

export async function getTravelPreferences(householdId: string) {
  const existing = await db.travelPreferences.findUnique({ where: { householdId } });
  if (existing) return existing;
  return db.travelPreferences.create({ data: { householdId } });
}

/** Windows worth showing on the overview: upcoming, not dismissed. */
export async function upcomingWindows(householdId: string, limit = 8) {
  return db.travelWindow.findMany({
    where: {
      householdId,
      status: { not: "DISMISSED" },
      endDate: { gte: addDays(startOfDay(today()), -1) },
    },
    orderBy: [{ score: "desc" }],
    take: limit,
  });
}
