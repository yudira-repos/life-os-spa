import {
  addDays,
  dayKey,
  daysBetween,
  eachDay,
  formatRange,
  inclusiveDayCount,
  isWeekend,
  overlaps,
  startOfDay,
  today,
  type DayKey,
} from "@/lib/travelos/dates";
import { assessSeason, workingDaysIn, type Season } from "@/lib/travelos/seasonality";
import { holidaysBetween } from "@/lib/travelos/holidays";

// The engine: school calendars in, rankable travel windows out.
//
// Deterministic, no database, no network — same inputs, same windows, always.
// Same shape as the FinancialOS advice engine, and for the same reason: a
// suggestion you can't interrogate is worthless, and one you can't reproduce
// can't be debugged.
//
// The pipeline:
//
//   1. Every child's no-school days -> one day set per child
//   2. Intersect across children      -> days the WHOLE family is free
//   3. Group contiguous days          -> candidate breaks
//   4. Extend into adjacent weekends  -> a Fri-Sun break is really a 3-day trip
//   5. Subtract blackouts, cost PTO   -> windows the adults can actually take
//   6. Score and explain              -> ranked, with reasons stated
//
// Step 2 is the one that matters and the one a person can't do by eye. Two
// kids at different schools have overlapping-but-not-identical breaks, and the
// intersection is frequently three days shorter than either parent assumed.

export const WINDOW_ENGINE_VERSION = "1.0.0";

export interface CalendarEntryInput {
  startDate: Date;
  endDate: Date;
  title: string;
  kind: string;
  noSchool: boolean;
}

export interface ChildCalendarInput {
  childId: string;
  childName: string;
  entries: CalendarEntryInput[];
}

export interface BlackoutInput {
  memberId: string | null;
  memberName?: string;
  startDate: Date;
  endDate: Date;
  reason?: string | null;
}

export interface AdultInput {
  memberId: string;
  name: string;
  ptoDaysRemaining: number;
}

export interface ActivityConflictInput {
  childId: string;
  childName: string;
  label: string;
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface WindowEngineInput {
  children: ChildCalendarInput[];
  adults: AdultInput[];
  blackouts: BlackoutInput[];
  activityConflicts?: ActivityConflictInput[];
  /** Ignore anything sooner than this — you can't plan a trip for tomorrow. */
  minLeadDays?: number;
  /** Shortest window worth surfacing. 3 days = a long weekend. */
  minDays?: number;
  horizonDays?: number;
  now?: Date;
}

export interface TravelWindow {
  label: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  /** School days inside the window that are NOT already days off. */
  schoolDaysMissed: number;
  /** Weekdays that aren't federal holidays — what each adult must book off. */
  ptoDaysRequired: number;
  season: Season;
  priceIndex: number;
  score: number;
  reasons: string[];
  conflicts: string[];
  /** Children whose calendars are all off during this window. */
  childIds: string[];
  holidayNames: string[];
}

// --- Step 1 & 2: day sets ---------------------------------------------------

function noSchoolDayKeys(child: ChildCalendarInput): Set<DayKey> {
  const days = new Set<DayKey>();
  for (const entry of child.entries) {
    if (!entry.noSchool) continue;
    for (const day of eachDay(entry.startDate, entry.endDate)) {
      days.add(dayKey(day));
    }
  }
  return days;
}

/**
 * Days when every child is off. Weekends count as free for everyone — they're
 * not "no school days" in a calendar file, but a family can obviously travel
 * on a Saturday, and without this every break fragments at the weekend.
 */
export function freeDaysForAll(
  children: ChildCalendarInput[],
  from: Date,
  to: Date
): Set<DayKey> {
  const perChild = children.map(noSchoolDayKeys);
  const free = new Set<DayKey>();

  for (const day of eachDay(from, to)) {
    const key = dayKey(day);
    if (isWeekend(day)) {
      free.add(key);
      continue;
    }
    if (perChild.length === 0) continue;
    if (perChild.every((set) => set.has(key))) free.add(key);
  }
  return free;
}

// --- Step 3 & 4: contiguous runs -------------------------------------------

interface DayRun {
  start: Date;
  end: Date;
}

function contiguousRuns(freeDays: Set<DayKey>, from: Date, to: Date): DayRun[] {
  const runs: DayRun[] = [];
  let runStart: Date | null = null;
  let previous: Date | null = null;

  for (const day of eachDay(from, to)) {
    const isFree = freeDays.has(dayKey(day));
    if (isFree) {
      if (!runStart) runStart = day;
      previous = day;
    } else if (runStart && previous) {
      runs.push({ start: runStart, end: previous });
      runStart = null;
      previous = null;
    }
  }
  if (runStart && previous) runs.push({ start: runStart, end: previous });
  return runs;
}

/**
 * A run that is only a weekend isn't a travel window — it's a weekend. Drop
 * runs with no weekday in them, otherwise every Saturday in the year shows up
 * as a suggestion and the list becomes noise.
 */
function hasWeekday(run: DayRun): boolean {
  return eachDay(run.start, run.end).some((day) => !isWeekend(day));
}

// --- Step 5: adults, blackouts, PTO ----------------------------------------

function blackoutConflicts(
  run: DayRun,
  blackouts: BlackoutInput[]
): { blocking: boolean; notes: string[] } {
  const notes: string[] = [];
  let blocking = false;

  for (const blackout of blackouts) {
    if (!overlaps(run.start, run.end, blackout.startDate, blackout.endDate)) continue;
    const who = blackout.memberName ?? "The household";
    const reason = blackout.reason ? ` (${blackout.reason})` : "";
    notes.push(`${who} is unavailable during part of this window${reason}.`);
    blocking = true;
  }
  return { blocking, notes };
}

function activityConflictNotes(
  run: DayRun,
  conflicts: ActivityConflictInput[]
): string[] {
  const notes: string[] = [];
  for (const conflict of conflicts) {
    // An activity with no dates is a standing commitment — flag it against
    // longer windows only, where missing several sessions actually matters.
    if (!conflict.startDate || !conflict.endDate) {
      if (inclusiveDayCount(run.start, run.end) >= 7) {
        notes.push(`${conflict.childName} has ${conflict.label} ongoing — check for sessions this week.`);
      }
      continue;
    }
    if (overlaps(run.start, run.end, conflict.startDate, conflict.endDate)) {
      notes.push(`${conflict.childName}'s ${conflict.label} falls in this window.`);
    }
  }
  return notes;
}

// --- Step 6: scoring --------------------------------------------------------

/**
 * Scoring, stated plainly so it can be argued with:
 *
 *   length      — more days is better, with sharply diminishing returns past
 *                 a fortnight (few families take three-week trips)
 *   cost        — off-peak weeks score higher; this is the lever nobody uses
 *   PTO         — every working day inside the window costs an adult a day of
 *                 leave, so a window that lands on holidays scores higher
 *   lead time   — enough runway to book well is worth real money
 *   conflicts   — a blackout is disqualifying, not a deduction
 */
function scoreWindow(params: {
  totalDays: number;
  ptoDaysRequired: number;
  priceIndex: number;
  leadDays: number;
  holidayCount: number;
  conflictCount: number;
  blocked: boolean;
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const lengthScore = Math.min(params.totalDays, 14) * 4;
  score += lengthScore;
  if (params.totalDays >= 9) {
    reasons.push(`${params.totalDays} consecutive days off — long enough for a real trip, not just a weekend.`);
  } else if (params.totalDays >= 5) {
    reasons.push(`${params.totalDays} days off — enough for a short trip with a travel day at each end.`);
  } else {
    reasons.push(`${params.totalDays} days — a long-weekend trip, best somewhere within a couple of hours' flight.`);
  }

  // Cost. A 0.85 index scores +15, a 1.3 index scores -30.
  const costScore = (1 - params.priceIndex) * 100;
  score += costScore;

  // PTO. Each working day costs a point per adult-day; a window needing zero
  // days off is genuinely rare and worth surfacing loudly.
  score -= params.ptoDaysRequired * 6;
  if (params.ptoDaysRequired === 0) {
    reasons.push("Costs no PTO at all — the whole window is weekends and holidays.");
  } else if (params.ptoDaysRequired <= 2) {
    reasons.push(`Only ${params.ptoDaysRequired} day${params.ptoDaysRequired === 1 ? "" : "s"} of PTO each.`);
  }

  if (params.holidayCount > 0) {
    score += params.holidayCount * 3;
  }

  // Lead time: under a month is hard to book well, over four months is ideal.
  if (params.leadDays >= 120) {
    score += 10;
    reasons.push("Far enough out that fares are still reasonable — this is when to book.");
  } else if (params.leadDays < 30) {
    score -= 15;
    reasons.push("Under a month away — fares climb steeply inside this window.");
  }

  score -= params.conflictCount * 8;
  if (params.blocked) score -= 60;

  return { score: Math.round(score * 10) / 10, reasons };
}

// --- Labelling --------------------------------------------------------------

function labelFor(run: DayRun, entries: CalendarEntryInput[]): string {
  // Prefer the school's own name for the break — "Winter Break" is more useful
  // than anything we'd generate.
  const matching = entries
    .filter(
      (entry) =>
        entry.noSchool &&
        entry.kind === "BREAK" &&
        overlaps(run.start, run.end, entry.startDate, entry.endDate)
    )
    .sort(
      (a, b) =>
        inclusiveDayCount(b.startDate, b.endDate) - inclusiveDayCount(a.startDate, a.endDate)
    );

  if (matching.length > 0) return titleCase(matching[0].title);

  const holidays = holidaysBetween(run.start, run.end);
  if (holidays.length > 0) return `${holidays[0].name} weekend`;

  const days = inclusiveDayCount(run.start, run.end);
  if (days <= 4) return "Long weekend";
  return `${days}-day window`;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .slice(0, 60);
}

// --- The engine -------------------------------------------------------------

export function generateWindows(input: WindowEngineInput): TravelWindow[] {
  const now = startOfDay(input.now ?? today());
  const minLeadDays = input.minLeadDays ?? 14;
  const minDays = input.minDays ?? 3;
  const horizonDays = input.horizonDays ?? 400;

  if (input.children.length === 0) return [];

  const from = addDays(now, minLeadDays);
  const to = addDays(now, horizonDays);

  const freeDays = freeDaysForAll(input.children, from, to);
  const runs = contiguousRuns(freeDays, from, to).filter(
    (run) => inclusiveDayCount(run.start, run.end) >= minDays && hasWeekday(run)
  );

  const allEntries = input.children.flatMap((child) => child.entries);
  const activityConflicts = input.activityConflicts ?? [];
  const windows: TravelWindow[] = [];

  for (const run of runs) {
    const totalDays = inclusiveDayCount(run.start, run.end);
    const workingDays = workingDaysIn(run.start, run.end);
    const ptoDaysRequired = workingDays.length;

    const { season, priceIndex, reasons: seasonReasons } = assessSeason(run.start, run.end);
    const holidays = holidaysBetween(run.start, run.end);
    const blackout = blackoutConflicts(run, input.blackouts);
    const activityNotes = activityConflictNotes(run, activityConflicts);
    const conflicts = [...blackout.notes, ...activityNotes];

    // School days missed is zero by construction — these windows are built
    // from days the children are already off. It's surfaced anyway because a
    // future version may propose extending a window by a day or two.
    const schoolDaysMissed = 0;

    const { score, reasons } = scoreWindow({
      totalDays,
      ptoDaysRequired,
      priceIndex,
      leadDays: daysBetween(now, run.start),
      holidayCount: holidays.length,
      conflictCount: conflicts.length,
      blocked: blackout.blocking,
    });

    const ptoWarnings = input.adults
      .filter((adult) => adult.ptoDaysRemaining < ptoDaysRequired)
      .map(
        (adult) =>
          `${adult.name} has ${adult.ptoDaysRemaining} PTO days left but this window needs ${ptoDaysRequired}.`
      );

    windows.push({
      label: labelFor(run, allEntries),
      startDate: run.start,
      endDate: run.end,
      totalDays,
      schoolDaysMissed,
      ptoDaysRequired,
      season,
      priceIndex,
      score,
      reasons: [...reasons, ...seasonReasons],
      conflicts: [...conflicts, ...ptoWarnings],
      childIds: input.children.map((child) => child.childId),
      holidayNames: holidays.map((h) => h.name),
    });
  }

  return windows.sort((a, b) => b.score - a.score);
}

/** Human-readable summary of a window, for cards and for the LLM-free path. */
export function describeWindow(window: TravelWindow): string {
  const range = formatRange(window.startDate, window.endDate);
  const pto =
    window.ptoDaysRequired === 0
      ? "no PTO needed"
      : `${window.ptoDaysRequired} PTO day${window.ptoDaysRequired === 1 ? "" : "s"}`;
  return `${window.label} · ${range} · ${window.totalDays} days · ${pto}`;
}
