import { utcDay, dayKey, addDays, type DayKey } from "@/lib/travelos/dates";

// US federal holidays, computed rather than listed.
//
// A hardcoded list expires. These are defined by rule ("third Monday in
// January"), so computing them means the module still works in 2031 without
// anyone remembering to update a table — the same reason the FinancialOS
// constants file carries a tax year rather than pretending to be timeless.
//
// Used for two things: a Monday holiday next to a school break turns a
// long weekend into a real trip, and holiday weeks are the expensive ones to
// fly in, which the ranking needs to say out loud.

export interface Holiday {
  key: string;
  name: string;
  date: Date;
  /** Federal holidays that reliably spike airfare and hotel rates. */
  travelPeak: boolean;
}

/** The nth given weekday of a month. n = -1 means the last one. */
function nthWeekday(year: number, month1to12: number, weekday: number, n: number): Date {
  if (n > 0) {
    const first = utcDay(year, month1to12, 1);
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return addDays(first, offset + (n - 1) * 7);
  }
  // Last occurrence: walk back from the final day of the month.
  const lastDay = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  const last = utcDay(year, month1to12, lastDay);
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return addDays(last, -offset);
}

/**
 * A fixed-date holiday falling on a weekend is observed on the adjacent
 * weekday — Saturday shifts to Friday, Sunday to Monday. That observed day is
 * the one that's actually a day off, so it's the one that matters here.
 */
function observed(date: Date): Date {
  const day = date.getUTCDay();
  if (day === 6) return addDays(date, -1);
  if (day === 0) return addDays(date, 1);
  return date;
}

export function federalHolidays(year: number): Holiday[] {
  return [
    { key: "new_years", name: "New Year's Day", date: observed(utcDay(year, 1, 1)), travelPeak: true },
    { key: "mlk", name: "Martin Luther King Jr. Day", date: nthWeekday(year, 1, 1, 3), travelPeak: false },
    { key: "presidents", name: "Presidents' Day", date: nthWeekday(year, 2, 1, 3), travelPeak: true },
    { key: "memorial", name: "Memorial Day", date: nthWeekday(year, 5, 1, -1), travelPeak: true },
    { key: "juneteenth", name: "Juneteenth", date: observed(utcDay(year, 6, 19)), travelPeak: false },
    { key: "independence", name: "Independence Day", date: observed(utcDay(year, 7, 4)), travelPeak: true },
    { key: "labor", name: "Labor Day", date: nthWeekday(year, 9, 1, 1), travelPeak: true },
    { key: "columbus", name: "Columbus Day / Indigenous Peoples' Day", date: nthWeekday(year, 10, 1, 2), travelPeak: false },
    { key: "veterans", name: "Veterans Day", date: observed(utcDay(year, 11, 11)), travelPeak: false },
    { key: "thanksgiving", name: "Thanksgiving", date: nthWeekday(year, 11, 4, 4), travelPeak: true },
    { key: "christmas", name: "Christmas Day", date: observed(utcDay(year, 12, 25)), travelPeak: true },
  ];
}

export function holidaysBetween(start: Date, end: Date): Holiday[] {
  const holidays: Holiday[] = [];
  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
    for (const holiday of federalHolidays(year)) {
      if (holiday.date >= start && holiday.date <= end) holidays.push(holiday);
    }
  }
  return holidays.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Day keys of federal holidays in a range — days nobody needs PTO for. */
export function holidayDayKeys(start: Date, end: Date): Set<DayKey> {
  return new Set(holidaysBetween(start, end).map((h) => dayKey(h.date)));
}
