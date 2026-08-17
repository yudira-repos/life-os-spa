import { db } from "@/lib/db";
import { addDays, startOfDay, today } from "@/lib/travelos/dates";

// PropertyOS → FinancialOS. One direction, one file, degrades to nothing when
// FinancialOS isn't entitled — the same contract TravelOS uses.

export interface HomeFundResult {
  goalId: string;
  created: boolean;
  targetCents: number;
  monthlyContributionCents: number;
}

/**
 * Keep the FinancialOS home maintenance goal sized to what this house
 * actually costs.
 *
 * The goal template ships with a $15,000 placeholder derived from "about 1% of
 * home value per year". Once PropertyOS knows the real equipment list and
 * maintenance schedule, it can replace that guess with a number built from
 * this house: a year of scheduled maintenance plus a year of replacement
 * reserve on the equipment that's aging.
 *
 * That's the whole point of the two modules living in the same platform —
 * the guess becomes an estimate with a derivation you can read.
 */
export async function syncHomeMaintenanceFund(params: {
  householdId: string;
  annualMaintenanceCents: number;
  annualReserveCents: number;
}): Promise<HomeFundResult | null> {
  const entitled = await db.entitlement.findUnique({
    where: {
      householdId_moduleId: { householdId: params.householdId, moduleId: "financial" },
    },
  });
  if (!entitled?.enabled) return null;

  // A rolling fund, not a one-off target: hold a year of expected costs.
  const targetCents = params.annualMaintenanceCents + params.annualReserveCents;
  if (targetCents <= 0) return null;

  const monthlyContributionCents = Math.ceil(targetCents / 12);
  const targetDate = addDays(startOfDay(today()), 365);

  const existing = await db.savingsGoal.findFirst({
    where: {
      householdId: params.householdId,
      OR: [{ templateKey: "home_repair" }, { kind: "HOME_REPAIR" }],
    },
    orderBy: { createdAt: "asc" },
  });

  const notes =
    `Sized by PropertyOS from this house: ${formatDollars(params.annualMaintenanceCents)} of scheduled maintenance ` +
    `plus ${formatDollars(params.annualReserveCents)} of replacement reserve on the equipment you've recorded. ` +
    `Recalculated whenever the equipment list or schedule changes.`;

  if (existing) {
    await db.savingsGoal.update({
      where: { id: existing.id },
      data: { targetCents, monthlyContributionCents, notes },
    });
    return {
      goalId: existing.id,
      created: false,
      targetCents,
      monthlyContributionCents,
    };
  }

  const goal = await db.savingsGoal.create({
    data: {
      householdId: params.householdId,
      templateKey: "home_repair",
      name: "Home maintenance fund",
      kind: "HOME_REPAIR",
      targetCents,
      targetDate,
      monthlyContributionCents,
      priority: 55,
      notes,
    },
  });

  return {
    goalId: goal.id,
    created: true,
    targetCents,
    monthlyContributionCents,
  };
}

/** What's already set aside, if FinancialOS is on. */
export async function homeFundSnapshot(householdId: string): Promise<{
  currentCents: number;
  targetCents: number;
  goalId: string;
} | null> {
  const entitled = await db.entitlement.findUnique({
    where: { householdId_moduleId: { householdId, moduleId: "financial" } },
  });
  if (!entitled?.enabled) return null;

  const goal = await db.savingsGoal.findFirst({
    where: {
      householdId,
      OR: [{ templateKey: "home_repair" }, { kind: "HOME_REPAIR" }],
    },
    orderBy: { createdAt: "asc" },
  });
  if (!goal) return null;

  return {
    currentCents: goal.currentCents,
    targetCents: goal.targetCents,
    goalId: goal.id,
  };
}

/**
 * Match a bill payment to a real transaction, so "did I pay this?" is answered
 * from the bank feed rather than from memory.
 *
 * Conservative on purpose: same rough amount, within a window around the due
 * date. A wrong match marks a bill paid that wasn't, which is worse than no
 * match at all — so anything ambiguous returns nothing.
 */
export async function findMatchingPayment(params: {
  householdId: string;
  billName: string;
  expectedCents: number;
  dueDate: Date;
  windowDays?: number;
}): Promise<{ transactionId: string; amountCents: number; date: Date } | null> {
  const entitled = await db.entitlement.findUnique({
    where: {
      householdId_moduleId: { householdId: params.householdId, moduleId: "financial" },
    },
  });
  if (!entitled?.enabled) return null;
  if (params.expectedCents <= 0) return null;

  const window = params.windowDays ?? 21;
  const from = addDays(params.dueDate, -window);
  const to = addDays(params.dueDate, window);

  // Bills are outflows, stored negative. Allow ±20% — utility bills vary
  // month to month by more than a rounding error.
  const low = Math.round(params.expectedCents * 0.8);
  const high = Math.round(params.expectedCents * 1.2);

  const candidates = await db.transaction.findMany({
    where: {
      householdId: params.householdId,
      date: { gte: from, lte: to },
      amountCents: { lte: -low, gte: -high },
      pending: false,
    },
    select: { id: true, amountCents: true, date: true, name: true, merchantName: true },
  });

  const needle = params.billName.toLowerCase().split(/\s+/)[0];
  const matches = candidates.filter((transaction) => {
    const haystack = `${transaction.name} ${transaction.merchantName ?? ""}`.toLowerCase();
    return needle.length >= 3 && haystack.includes(needle);
  });

  // Exactly one plausible match, or nothing. Ambiguity is not a match.
  if (matches.length !== 1) return null;

  return {
    transactionId: matches[0].id,
    amountCents: Math.abs(matches[0].amountCents),
    date: matches[0].date,
  };
}

function formatDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}
