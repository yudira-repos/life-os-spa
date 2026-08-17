import { addDays, daysBetween, startOfDay, today, utcDay } from "@/lib/travelos/dates";

// Due-date arithmetic for recurring maintenance.
//
// Reuses travelos/dates.ts rather than reimplementing calendar-day handling —
// the same off-by-one-day bug that would move a school break also moves a
// filter change past its warranty window, and one implementation is one place
// to get it right.
//
// The rule that matters: THE NEXT DUE DATE IS COMPUTED FROM WHEN THE WORK WAS
// ACTUALLY DONE, not from when it was scheduled. If a 90-day filter change was
// due March 1 and you did it March 20, the next one is June 18 — not May 30.
// Scheduling from the due date makes every overdue task permanently overdue,
// and people stop trusting the list within a month.

export type DueStatus = "OVERDUE" | "DUE_SOON" | "UPCOMING" | "SCHEDULED" | "SNOOZED";

export const DUE_STATUS_LABELS: Record<DueStatus, string> = {
  OVERDUE: "Overdue",
  DUE_SOON: "Due now",
  UPCOMING: "Coming up",
  SCHEDULED: "Scheduled",
  SNOOZED: "Snoozed",
};

/** Within this many days counts as "due now" rather than "coming up". */
export const DUE_SOON_DAYS = 14;
/** The horizon the dashboard looks ahead over. */
export const UPCOMING_DAYS = 45;

export function dueStatus(
  nextDueDate: Date,
  options: { snoozedUntil?: Date | null; now?: Date } = {}
): DueStatus {
  const now = startOfDay(options.now ?? today());

  if (options.snoozedUntil && startOfDay(options.snoozedUntil) > now) {
    return "SNOOZED";
  }

  const days = daysBetween(now, nextDueDate);
  if (days < 0) return "OVERDUE";
  if (days <= DUE_SOON_DAYS) return "DUE_SOON";
  if (days <= UPCOMING_DAYS) return "UPCOMING";
  return "SCHEDULED";
}

export function daysUntilDue(nextDueDate: Date, now?: Date): number {
  return daysBetween(startOfDay(now ?? today()), nextDueDate);
}

/**
 * The next occurrence after completing a task.
 *
 * Interval tasks: completion date + interval.
 *
 * Seasonal tasks: the next occurrence of the target month, because "clean the
 * gutters before the rains" is a month, not a spacing. Cleaning them late in
 * December shouldn't push next year's clean into January — it should still be
 * next October.
 */
export function nextDueAfterCompletion(params: {
  completedAt: Date;
  intervalDays: number;
  seasonalMonths?: number[] | null;
}): Date {
  const completed = startOfDay(params.completedAt);

  const months = (params.seasonalMonths ?? []).filter((m) => m >= 1 && m <= 12);
  if (months.length > 0) {
    return nextSeasonalDate(completed, months);
  }

  return addDays(completed, Math.max(params.intervalDays, 1));
}

/**
 * The next date landing in one of the given months, strictly after `from`.
 * Anchored to the first of the month — a specific day would imply a precision
 * seasonal tasks don't have.
 */
export function nextSeasonalDate(from: Date, months: number[]): Date {
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  const year = from.getUTCFullYear();

  const candidates = [
    ...sorted.map((month) => utcDay(year, month, 1)),
    ...sorted.map((month) => utcDay(year + 1, month, 1)),
  ];

  // Require real separation, so completing a task inside its own target month
  // doesn't immediately reschedule it to a few days later.
  const minimum = addDays(from, 60);
  return candidates.find((date) => date >= minimum) ?? addDays(from, 365);
}

/**
 * The first due date for a newly created task. A brand-new task shouldn't all
 * land on day one — that produces a list of 25 overdue items on the first
 * visit, which people close and never reopen.
 *
 * Seasonal tasks go to their season. Interval tasks are spread across their
 * own interval, deterministically by key, so the workload distributes.
 */
export function initialDueDate(params: {
  key: string;
  intervalDays: number;
  seasonalMonths?: number[] | null;
  now?: Date;
}): Date {
  const now = startOfDay(params.now ?? today());

  const months = (params.seasonalMonths ?? []).filter((m) => m >= 1 && m <= 12);
  if (months.length > 0) {
    const sorted = [...new Set(months)].sort((a, b) => a - b);
    const year = now.getUTCFullYear();
    const candidates = [
      ...sorted.map((month) => utcDay(year, month, 1)),
      ...sorted.map((month) => utcDay(year + 1, month, 1)),
    ];
    return candidates.find((date) => date >= now) ?? addDays(now, 180);
  }

  // Deterministic spread: hash the key to a fraction of the interval. Same key
  // always lands on the same offset, so re-seeding doesn't shuffle everything.
  const hash = [...params.key].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const offset = hash % Math.max(params.intervalDays, 1);

  // Short-interval tasks (weekly pool service) shouldn't be pushed far out.
  const spread = params.intervalDays <= 30 ? Math.min(offset, 7) : offset;
  return addDays(now, spread);
}

export interface ScheduledItem {
  id: string;
  name: string;
  nextDueDate: Date;
  status: DueStatus;
  daysUntil: number;
}

/** Sort by urgency: overdue first, oldest overdue at the top. */
export function byUrgency<T extends { nextDueDate: Date }>(items: T[], now?: Date): T[] {
  const reference = startOfDay(now ?? today());
  return [...items].sort(
    (a, b) =>
      daysBetween(reference, a.nextDueDate) - daysBetween(reference, b.nextDueDate)
  );
}

/** Annualised cost of a recurring task — what it really costs to own. */
export function annualCostCents(intervalDays: number, costCents: number): number {
  if (intervalDays <= 0) return 0;
  return Math.round((365 / intervalDays) * costCents);
}

/** Annualised time, in minutes. */
export function annualMinutes(intervalDays: number, minutes: number): number {
  if (intervalDays <= 0) return 0;
  return Math.round((365 / intervalDays) * minutes);
}

/** Plain-language due description: "3 days overdue", "due in 5 days", "due today". */
export function describeDue(nextDueDate: Date, now?: Date): string {
  const days = daysUntilDue(nextDueDate, now);
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days > 0) return `due in ${days} days`;
  if (days === -1) return "1 day overdue";
  return `${Math.abs(days)} days overdue`;
}
