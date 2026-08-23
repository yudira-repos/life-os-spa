// Turning a recurring activity into the days it actually happens.
//
// A deliberate non-decision: DayOS does NOT implement RFC 5545 RRULE. Every
// activity this module exists to coordinate — school pickup, dance on Tuesdays,
// Wednesday carpool, Saturday soccer — is "these weekdays, between these two
// dates, except when school is out". RRULE's monthly-by-set-position machinery
// buys nothing here and costs a parser, an expander, and a class of bugs where
// a reminder fires on a day nobody expected.
//
// What we do support:
//   - a set of weekdays (Mon-Fri, or just Wednesday)
//   - an effective window (starts Sept 3, ends June 12)
//   - explicit skip days (spring break, a cancelled class)
//   - "school days only", which reads no-school days from TravelOS calendars
//
// Anything genuinely one-off is stored as a single-date activity instead of
// being expressed as a recurrence. That keeps this file small and total.

import { addDays, dayKey, inclusiveDayCount, parseDay } from "@/lib/travelos/dates";
import { weekdayIndex, type MinuteOfDay } from "@/lib/dayos/time";

/** Sunday = 0, matching Date#getUTCDay and every JS calendar. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS_SCHOOL: Weekday[] = [1, 2, 3, 4, 5];

/** Stored as CSV of digits ("1,2,3,4,5") so it stays queryable and obvious. */
export function parseWeekdays(csv: string | null | undefined): Weekday[] {
  if (!csv) return [];
  const out = new Set<Weekday>();
  for (const part of csv.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n as Weekday);
  }
  return [...out].sort((a, b) => a - b);
}

export function formatWeekdays(days: Weekday[]): string {
  return [...days].sort((a, b) => a - b).join(",");
}

/** "Mon–Fri" / "Tue & Thu" / "Wed" — how the recurrence reads in the UI. */
export function describeWeekdays(days: Weekday[]): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0) return "Never";
  if (sorted.length === 7) return "Every day";
  if (sorted.join(",") === "1,2,3,4,5") return "Mon–Fri";
  if (sorted.join(",") === "0,6") return "Weekends";

  // Collapse runs of three or more into a dash range; the rest join with &.
  const chunks: string[] = [];
  let runStart = 0;
  for (let i = 1; i <= sorted.length; i += 1) {
    const broken = i === sorted.length || sorted[i] !== sorted[i - 1] + 1;
    if (!broken) continue;
    const runLength = i - runStart;
    if (runLength >= 3) {
      chunks.push(`${names[sorted[runStart]]}–${names[sorted[i - 1]]}`);
    } else {
      for (let j = runStart; j < i; j += 1) chunks.push(names[sorted[j]]);
    }
    runStart = i;
  }
  return chunks.join(" & ");
}

export interface RecurrenceInput {
  /** Empty means the activity happens once, on effectiveFrom. */
  weekdays: Weekday[];
  effectiveFrom: Date;
  effectiveTo: Date | null;
  /** Calendar days this activity is explicitly skipped. */
  skipDays?: Date[];
  /**
   * When true, days the household's children have no school are skipped.
   * The no-school set is passed in rather than read here — this file stays
   * database-free, and the caller already knows which module supplied it.
   */
  schoolDaysOnly?: boolean;
  noSchoolDays?: Date[];
}

export interface OccurrenceDay {
  day: Date;
  dayKey: string;
  weekday: Weekday;
}

/**
 * Every day in [from, to] this activity happens. Inclusive on both ends.
 *
 * Guards against an unbounded expansion: a caller asking for a decade gets a
 * decade of days, which is a memory bug waiting to happen in a request path.
 * MAX_SPAN_DAYS is generous for the real callers (a day, a week, a month).
 */
export const MAX_SPAN_DAYS = 400;

export function expandOccurrences(
  recurrence: RecurrenceInput,
  from: Date,
  to: Date
): OccurrenceDay[] {
  const span = inclusiveDayCount(from, to);
  if (span <= 0) return [];
  if (span > MAX_SPAN_DAYS) {
    throw new RangeError(
      `expandOccurrences: ${span}-day span exceeds MAX_SPAN_DAYS (${MAX_SPAN_DAYS})`
    );
  }

  const skip = new Set((recurrence.skipDays ?? []).map((d) => dayKey(d)));
  if (recurrence.schoolDaysOnly) {
    for (const d of recurrence.noSchoolDays ?? []) skip.add(dayKey(d));
  }

  const start = recurrence.effectiveFrom;
  const end = recurrence.effectiveTo;
  const weekdaySet = new Set(recurrence.weekdays);
  const oneOff = recurrence.weekdays.length === 0;

  const out: OccurrenceDay[] = [];
  for (let i = 0; i < span; i += 1) {
    const day = addDays(from, i);
    if (day < start) continue;
    if (end && day > end) continue;

    const weekday = weekdayIndex(day) as Weekday;
    if (oneOff) {
      if (dayKey(day) !== dayKey(start)) continue;
    } else if (!weekdaySet.has(weekday)) {
      continue;
    }

    const key = dayKey(day);
    if (skip.has(key)) continue;

    out.push({ day, dayKey: key, weekday });
  }
  return out;
}

/** Does this activity happen on this exact day? */
export function occursOn(recurrence: RecurrenceInput, day: Date): boolean {
  const d = parseDay(day);
  if (!d) return false;
  return expandOccurrences(recurrence, d, d).length > 0;
}

/** The next day on or after `from` that this activity happens, or null. */
export function nextOccurrence(
  recurrence: RecurrenceInput,
  from: Date,
  horizonDays = 60
): OccurrenceDay | null {
  const days = expandOccurrences(recurrence, from, addDays(from, horizonDays));
  return days[0] ?? null;
}

/** "Dance class · Tue & Thu · 5:00 PM" */
export function describeRecurrence(
  weekdays: Weekday[],
  startMinute: MinuteOfDay,
  formatClockFn: (m: MinuteOfDay) => string
): string {
  return `${describeWeekdays(weekdays)} · ${formatClockFn(startMinute)}`;
}
