import { eachDay, dayKey } from "@/lib/travelos/dates";
import { holidayDayKeys, holidaysBetween } from "@/lib/travelos/holidays";

// When travel is expensive, and why.
//
// This is a heuristic, and it's labelled as one everywhere it surfaces. It
// exists because the single most useful thing you can tell a family planning
// around school breaks is an uncomfortable one: every other family with kids
// is trying to travel in exactly the same weeks, and that's what you're paying
// for. Naming it lets people make the trade deliberately — take the expensive
// week, or use a teacher in-service Friday nobody else noticed.
//
// Real prices come from the flights provider. This only ranks windows before
// any price lookup, and explains the price once it arrives.

export type Season = "PEAK" | "SHOULDER" | "OFF_PEAK";

export const SEASON_LABELS: Record<Season, string> = {
  PEAK: "Peak season",
  SHOULDER: "Shoulder season",
  OFF_PEAK: "Off-peak",
};

export const SEASON_NOTES: Record<Season, string> = {
  PEAK: "Everyone with school-age kids is travelling this week. Expect the highest fares of the year.",
  SHOULDER: "Between the crowds and the bargains — usually good weather, moderate prices.",
  OFF_PEAK: "Cheapest time to fly. Fewer crowds, and the same destinations cost noticeably less.",
};

/**
 * Month-level baseline, US domestic. 1.0 is average; higher is pricier.
 * June-August and late December are peak because that's when school is out;
 * January-February and September-October are the classic cheap months.
 */
const MONTH_MULTIPLIER: Record<number, number> = {
  1: 0.85, // January (after the 2nd)
  2: 0.9,
  3: 1.05, // spring break season begins
  4: 1.05,
  5: 1.0,
  6: 1.25, // summer
  7: 1.3,
  8: 1.15,
  9: 0.85, // the cheapest month to fly, reliably
  10: 0.9,
  11: 1.05, // Thanksgiving pulls the month up
  12: 1.25, // the last two weeks dominate
};

export interface SeasonAssessment {
  season: Season;
  /** Rough multiplier vs a typical week. 1.0 = average. */
  priceIndex: number;
  reasons: string[];
}

export function assessSeason(start: Date, end: Date): SeasonAssessment {
  const days = eachDay(start, end);
  const reasons: string[] = [];

  const monthIndexes = days.map((d) => MONTH_MULTIPLIER[d.getUTCMonth() + 1] ?? 1);
  let index =
    monthIndexes.reduce((sum, value) => sum + value, 0) / Math.max(monthIndexes.length, 1);

  // Holiday weeks sit well above their month's baseline.
  const holidays = holidaysBetween(start, end);
  const peakHolidays = holidays.filter((h) => h.travelPeak);
  if (peakHolidays.length > 0) {
    index += 0.2 * peakHolidays.length;
    reasons.push(
      `Includes ${peakHolidays.map((h) => h.name).join(" and ")} — one of the most expensive travel periods of the year.`
    );
  } else if (holidays.length > 0) {
    reasons.push(`Includes ${holidays.map((h) => h.name).join(" and ")}.`);
  }

  // The last ten days of December are the single priciest stretch.
  const hasLateDecember = days.some(
    (d) => d.getUTCMonth() === 11 && d.getUTCDate() >= 20
  );
  if (hasLateDecember) {
    index += 0.15;
    reasons.push("Late December — book months ahead or expect to pay for it.");
  }

  // Early June and late August sit just outside the summer crush.
  const isEarlyJune = days.every((d) => d.getUTCMonth() === 5 && d.getUTCDate() <= 15);
  const isLateAugust = days.every((d) => d.getUTCMonth() === 7 && d.getUTCDate() >= 18);
  if (isEarlyJune || isLateAugust) {
    index -= 0.15;
    reasons.push("Just outside the summer peak — noticeably cheaper than mid-July for similar weather.");
  }

  const season: Season = index >= 1.15 ? "PEAK" : index >= 0.95 ? "SHOULDER" : "OFF_PEAK";

  if (season === "OFF_PEAK" && reasons.length === 0) {
    reasons.push("Off-peak weeks — the same trip costs meaningfully less than it would in summer.");
  }

  return { season, priceIndex: Number(index.toFixed(2)), reasons };
}

/** Days in a range that are neither weekend nor federal holiday — the PTO cost. */
export function workingDaysIn(start: Date, end: Date): Date[] {
  const holidays = holidayDayKeys(start, end);
  return eachDay(start, end).filter((day) => {
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) return false;
    return !holidays.has(dayKey(day));
  });
}
