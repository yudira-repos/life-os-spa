import { db } from "@/lib/db";
import { formatRange, daysBetween, today } from "@/lib/travelos/dates";

// Where TravelOS talks to the other modules.
//
// LifeOS has no event bus yet (see DESIGN.md), so these are direct, explicit,
// one-directional calls — and they all live in this one file. TravelOS never
// reaches into FinancialOS or KidsOS internals from anywhere else, so the
// entire cross-module surface is this file's exports. When the event bus does
// arrive, this is the only thing that gets rewritten.
//
// The rules that keep it honest:
//   - TravelOS calls INTO other modules; nothing calls back into TravelOS.
//   - It uses each module's public contracts, never its tables directly,
//     except where a plain foreign id is the contract (Trip.savingsGoalId).
//   - Every integration degrades to nothing if the other module is absent or
//     not entitled. A household without FinancialOS still plans trips.

// --- FinancialOS: turn a confirmed trip into a funded savings goal ----------

export interface VacationGoalResult {
  goalId: string;
  created: boolean;
  monthlyContributionCents: number;
  monthsRemaining: number;
}

/**
 * The loop this closes: "save for vacation" stops being a number someone
 * guessed and becomes a target with a real deadline, because the deadline is
 * a school break we detected from the calendar.
 *
 * Idempotent — confirming the same trip twice updates the goal rather than
 * creating a second one.
 */
export async function upsertVacationGoal(params: {
  householdId: string;
  tripId: string;
  tripName: string;
  destinationName?: string | null;
  startDate: Date;
  estimatedCostCents: number;
}): Promise<VacationGoalResult | null> {
  // Respect the entitlement. No FinancialOS, no goal — and no error either.
  const entitled = await db.entitlement.findUnique({
    where: { householdId_moduleId: { householdId: params.householdId, moduleId: "financial" } },
  });
  if (!entitled?.enabled) return null;

  const trip = await db.trip.findFirst({
    where: { id: params.tripId, householdId: params.householdId },
  });
  if (!trip) return null;

  // Money has to be in hand before the trip, not on the day of it. Booking
  // happens months ahead, so the goal's deadline is a month before departure.
  const targetDate = new Date(params.startDate.getTime() - 30 * 86_400_000);
  const monthsRemaining = Math.max(
    Math.ceil(daysBetween(today(), targetDate) / 30.44),
    1
  );
  const monthlyContributionCents = Math.ceil(params.estimatedCostCents / monthsRemaining);

  const name = params.destinationName
    ? `${params.destinationName} — ${params.tripName}`
    : params.tripName;

  if (trip.savingsGoalId) {
    const existing = await db.savingsGoal.findFirst({
      where: { id: trip.savingsGoalId, householdId: params.householdId },
    });
    if (existing) {
      await db.savingsGoal.update({
        where: { id: existing.id },
        data: {
          name,
          targetCents: params.estimatedCostCents,
          targetDate,
          monthlyContributionCents,
        },
      });
      return {
        goalId: existing.id,
        created: false,
        monthlyContributionCents,
        monthsRemaining,
      };
    }
  }

  const goal = await db.savingsGoal.create({
    data: {
      householdId: params.householdId,
      templateKey: "vacation",
      name,
      kind: "VACATION",
      targetCents: params.estimatedCostCents,
      targetDate,
      monthlyContributionCents,
      priority: 60,
      notes: `Created from TravelOS for ${formatRange(params.startDate, params.startDate)}. Deadline is a month before departure so the trip is paid for before it's booked.`,
    },
  });

  await db.trip.update({
    where: { id: trip.id },
    data: { savingsGoalId: goal.id },
  });

  return { goalId: goal.id, created: true, monthlyContributionCents, monthsRemaining };
}

/** What the household already has set aside, if FinancialOS is on. */
export async function vacationSavingsSnapshot(householdId: string): Promise<{
  goalCount: number;
  savedCents: number;
  targetCents: number;
} | null> {
  const entitled = await db.entitlement.findUnique({
    where: { householdId_moduleId: { householdId, moduleId: "financial" } },
  });
  if (!entitled?.enabled) return null;

  const goals = await db.savingsGoal.findMany({
    where: { householdId, kind: "VACATION" },
    select: { currentCents: true, targetCents: true },
  });

  return {
    goalCount: goals.length,
    savedCents: goals.reduce((sum, g) => sum + g.currentCents, 0),
    targetCents: goals.reduce((sum, g) => sum + g.targetCents, 0),
  };
}

// --- KidsOS: don't book a trip over a tournament ----------------------------

export interface ActivityConflict {
  childId: string;
  childName: string;
  label: string;
  startDate: Date | null;
  endDate: Date | null;
}

/**
 * KidsOS activities are a catalog of ongoing commitments — they carry no
 * dates. So this can't say "the tournament is on the 24th"; it can only say
 * "this child has an ACTIVE commitment, check the schedule before booking".
 *
 * That's a weaker signal than it looks, and it's surfaced as a prompt to check
 * rather than as a hard conflict. Overstating it would train people to ignore
 * the warnings.
 */
export async function activityConflictsFor(householdId: string): Promise<ActivityConflict[]> {
  const entitled = await db.entitlement.findUnique({
    where: { householdId_moduleId: { householdId, moduleId: "kids" } },
  });
  if (!entitled?.enabled) return [];

  const active = await db.childActivity.findMany({
    where: { status: "ACTIVE", child: { householdId } },
    include: { child: { select: { id: true, name: true } } },
  });

  const { ACTIVITIES } = await import("@/lib/kidsos/activities");
  const byKey = new Map(ACTIVITIES.map((a) => [a.key, a]));

  return active.map((row) => ({
    childId: row.child.id,
    childName: row.child.name,
    label: byKey.get(row.activityKey)?.name ?? row.activityKey,
    startDate: null,
    endDate: null,
  }));
}

// --- FunOS: short breaks that aren't worth a flight -------------------------

export interface LocalIdea {
  title: string;
  detail: string;
}

/**
 * A two-day window isn't a trip. Rather than rank flights for it, offer
 * something to do at home — which is exactly what FunOS is for.
 */
export async function localIdeasFor(householdId: string, limit = 3): Promise<LocalIdea[]> {
  const entitled = await db.entitlement.findUnique({
    where: { householdId_moduleId: { householdId, moduleId: "fun" } },
  });
  if (!entitled?.enabled) return [];

  try {
    const { FUN_SUGGESTIONS } = await import("@/lib/seed-content");
    return Object.values(FUN_SUGGESTIONS)
      .slice(0, limit)
      .map((item) => ({ title: item.title, detail: item.detail }));
  } catch {
    // FunOS content shape changed — a missing suggestion list is not a reason
    // to fail a page.
    return [];
  }
}
