import "dotenv/config";
import { db } from "@/lib/db";
import { parseDay, startOfDay } from "@/lib/travelos/dates";
import { dayContext } from "@/lib/dayos/service";
import { zonedDayKey } from "@/lib/dayos/time";

// One-off repair for Activity.effectiveFrom / effectiveTo.
//
// These columns are CALENDAR DAYS, but the create route used to write
// `new Date()` — a full instant. Two things went wrong as a result:
//
//   1. materializeDay compares against UTC midnight, so an activity added at
//      3pm was never effective on the day it was added.
//   2. Anything added after ~5pm Pacific has a UTC date of TOMORROW, so it
//      silently skipped its first real day.
//
// This rewrites each row to the household-local calendar day at UTC midnight,
// which is what every reader already assumes. Idempotent — rows that are
// already at midnight in the household's zone are left alone.

async function main() {
  const households = await db.household.findMany({ select: { id: true, name: true } });
  let fixed = 0;
  let checked = 0;

  for (const household of households) {
    const { timeZone } = await dayContext(household.id);
    const activities = await db.activity.findMany({
      where: { householdId: household.id },
      select: { id: true, name: true, effectiveFrom: true, effectiveTo: true },
    });

    for (const activity of activities) {
      checked += 1;

      // The day the household THOUGHT they were picking, read in their zone.
      const from = parseDay(zonedDayKey(activity.effectiveFrom, timeZone));
      const to = activity.effectiveTo
        ? parseDay(zonedDayKey(activity.effectiveTo, timeZone))
        : null;
      if (!from) continue;

      const fromChanged = from.getTime() !== startOfDay(activity.effectiveFrom).getTime()
        || activity.effectiveFrom.getTime() !== startOfDay(activity.effectiveFrom).getTime();
      const toChanged =
        activity.effectiveTo != null &&
        to != null &&
        activity.effectiveTo.getTime() !== to.getTime();

      if (!fromChanged && !toChanged) continue;

      await db.activity.update({
        where: { id: activity.id },
        data: { effectiveFrom: from, ...(toChanged && to ? { effectiveTo: to } : {}) },
      });
      fixed += 1;
      console.log(
        `  ${activity.name}: ${activity.effectiveFrom.toISOString()} -> ${from.toISOString()}`
      );
    }
  }

  console.log(`\nChecked ${checked} activities across ${households.length} household(s); normalized ${fixed}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
