// Date handling for TravelOS.
//
// Every date in this module is a CALENDAR DAY, not an instant. A school break
// starting "March 23" starts on March 23 wherever you are — it is not
// 2027-03-23T00:00:00 in some timezone that becomes March 22 for a user on the
// other side of the country.
//
// So: all dates are stored and compared as UTC midnight, and the only way to
// build one is through these helpers. This is the single most common source of
// off-by-one-day bugs in calendar code, and the reason a break can otherwise
// appear to start on a Sunday when the school said Monday.

export const MS_PER_DAY = 86_400_000;

/** A calendar day as "YYYY-MM-DD". The canonical form for comparisons. */
export type DayKey = string;

export function utcDay(year: number, month1to12: number, day: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, day));
}

/** Parse "YYYY-MM-DD" (or an ISO string) to UTC midnight. Null if unparseable. */
export function parseDay(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return startOfDay(value);

  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return utcDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // ICS basic format: 20270323
  const basic = /^(\d{4})(\d{2})(\d{2})/.exec(trimmed);
  if (basic) return utcDay(Number(basic[1]), Number(basic[2]), Number(basic[3]));

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed);
}

export function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

export function dayKey(date: Date): DayKey {
  return startOfDay(date).toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(startOfDay(date).getTime() + days * MS_PER_DAY);
}

/** Whole days from a to b. Same day = 0. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

/** Inclusive day count: Mon-Fri is 5, not 4. */
export function inclusiveDayCount(start: Date, end: Date): number {
  return daysBetween(start, end) + 1;
}

export function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const count = inclusiveDayCount(start, end);
  for (let i = 0; i < count; i += 1) days.push(addDays(start, i));
  return days;
}

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function isWeekday(date: Date): boolean {
  return !isWeekend(date);
}

export function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function intersection(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): { start: Date; end: Date } | null {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  return start <= end ? { start, end } : null;
}

export function formatDay(date: Date): string {
  return startOfDay(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatDayWithYear(date: Date): string {
  return startOfDay(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Mar 23 – 27, 2027" or "Dec 20, 2026 – Jan 3, 2027". */
export function formatRange(start: Date, end: Date): string {
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    return `${formatDay(start)} – ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${formatDay(start)} – ${formatDay(end)}, ${end.getUTCFullYear()}`;
  }
  return `${formatDayWithYear(start)} – ${formatDayWithYear(end)}`;
}

export function monthKey(date: Date): string {
  return dayKey(date).slice(0, 7);
}

export function today(): Date {
  return startOfDay(new Date());
}
