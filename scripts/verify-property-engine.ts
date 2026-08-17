/**
 * Verification for the PropertyOS scheduling, bill and equipment engines.
 *
 *   npm run verify:property
 *
 * No database, no network. Same approach as the other two suites.
 *
 * The cases that matter — the ones where being wrong costs money or quietly
 * breaks trust in the list:
 *
 *   1. Completion reschedules from the DONE date, not the due date
 *   2. Seasonal tasks stay in their season
 *   3. Initial due dates spread out instead of all landing on day one
 *   4. California's tax installments, including the 3-month/9-month asymmetry
 *   5. Bill recurrence is calendar-anchored, and month-end clamps correctly
 *   6. Price-jump alerts don't cry wolf on small bills
 *   7. Property conditions add and remove tasks, and adjust intervals
 *   8. Equipment age and warranty assessment
 */

import {
  nextDueAfterCompletion,
  initialDueDate,
  dueStatus,
  describeDue,
  annualCostCents,
  nextSeasonalDate,
} from "../src/lib/propertyos/schedule";
import {
  nextTaxDeadline,
  nextBillDueDate,
  annualBillCents,
  priceJump,
  taxScheduleFor,
  estimatedAnnualTaxCents,
} from "../src/lib/propertyos/bills";
import { templatesFor, TASK_TEMPLATES, type PropertyConditions } from "../src/lib/propertyos/catalog";
import { assessEquipment, annualDepreciationCents } from "../src/lib/propertyos/equipment";
import { cadenceFromInterval } from "../src/lib/propertyos/detect";
import { dayKey, utcDay, daysBetween } from "../src/lib/travelos/dates";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  [32m✓[0m ${name}`);
  } else {
    failed += 1;
    console.log(`  [31m✗[0m ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

function section(name: string) {
  console.log(`\n[1m${name}[0m`);
}

const BASE_CONDITIONS: PropertyConditions = {
  hasWaterSoftener: false,
  hasIrrigation: false,
  hasPool: false,
  hasSepticTank: false,
  hasFireplace: false,
  hardWater: false,
  dustyOrSmoky: false,
  heavyTreeCover: false,
};

// --- 1. Completion-anchored rescheduling ------------------------------------

section("1. The next due date comes from when the work was actually done");
{
  // A 90-day task due Mar 1, actually done Mar 20.
  const next = nextDueAfterCompletion({
    completedAt: utcDay(2027, 3, 20),
    intervalDays: 90,
  });

  check(
    "90 days from the completion date (Jun 18), not the due date (May 30)",
    dayKey(next) === "2027-06-18",
    dayKey(next)
  );

  // Done early: Feb 10 for a task not due until Mar 1.
  const early = nextDueAfterCompletion({
    completedAt: utcDay(2027, 2, 10),
    intervalDays: 90,
  });
  check(
    "doing it early also resets the clock (May 11)",
    dayKey(early) === "2027-05-11",
    dayKey(early)
  );

  check(
    "a task done today is not immediately overdue",
    dueStatus(nextDueAfterCompletion({ completedAt: utcDay(2027, 3, 20), intervalDays: 90 }), {
      now: utcDay(2027, 3, 20),
    }) !== "OVERDUE"
  );

  check("describeDue reads naturally when overdue",
    describeDue(utcDay(2027, 3, 1), utcDay(2027, 3, 8)) === "7 days overdue",
    describeDue(utcDay(2027, 3, 1), utcDay(2027, 3, 8)));
  check("and when upcoming",
    describeDue(utcDay(2027, 3, 15), utcDay(2027, 3, 8)) === "due in 7 days");
}

// --- 2. Seasonal tasks ------------------------------------------------------

section("2. Seasonal tasks stay in their season");
{
  // Gutters, target October/November, cleaned late in December.
  const next = nextDueAfterCompletion({
    completedAt: utcDay(2026, 12, 20),
    intervalDays: 182,
    seasonalMonths: [10, 11],
  });

  check(
    "cleaning gutters late doesn't push next year's clean to June — it stays October",
    dayKey(next) === "2027-10-01",
    dayKey(next)
  );

  // Consecutive months describe ONE window ("October or November"), not two
  // occurrences. Cleaning gutters on Oct 5 shouldn't re-prompt on Nov 1 —
  // it should go to next season. The 60-day minimum separation is what
  // distinguishes a window from a genuine twice-a-year schedule.
  const inSeason = nextSeasonalDate(utcDay(2027, 10, 5), [10, 11]);
  check(
    "consecutive months are one window — doing it Oct 5 schedules next year, not Nov 1",
    dayKey(inSeason) === "2028-10-01",
    dayKey(inSeason)
  );

  // Separated months ARE two occurrences: irrigation gets checked in spring
  // and again in autumn.
  const springCheck = nextSeasonalDate(utcDay(2027, 4, 10), [4, 10]);
  check(
    "separated months are genuinely twice a year — April schedules October",
    dayKey(springCheck) === "2027-10-01",
    dayKey(springCheck)
  );
  const autumnCheck = nextSeasonalDate(utcDay(2027, 10, 10), [4, 10]);
  check(
    "and October schedules the following April",
    dayKey(autumnCheck) === "2028-04-01",
    dayKey(autumnCheck)
  );

  const chimney = nextDueAfterCompletion({
    completedAt: utcDay(2027, 9, 15),
    intervalDays: 365,
    seasonalMonths: [9, 10],
  });
  check("annual seasonal task lands in its month next year",
    dayKey(chimney) === "2027-10-01" || dayKey(chimney) === "2028-09-01",
    dayKey(chimney));
}

// --- 3. Initial spread ------------------------------------------------------

section("3. New tasks spread out instead of all landing on day one");
{
  const now = utcDay(2027, 1, 4);
  const dates = TASK_TEMPLATES.map((template) =>
    initialDueDate({
      key: template.key,
      intervalDays: template.intervalDays,
      seasonalMonths: template.seasonalMonths,
      now,
    })
  );

  const onDayOne = dates.filter((date) => daysBetween(now, date) === 0).length;
  check(
    "not every task is due immediately",
    onDayOne <= 2,
    `${onDayOne} of ${dates.length} landed on day one`
  );

  const distinct = new Set(dates.map(dayKey)).size;
  check("due dates are spread across many days", distinct >= 10, `${distinct} distinct dates`);

  check(
    "none are scheduled in the past",
    dates.every((date) => date >= now)
  );

  // Deterministic: same key, same offset, every time.
  const first = initialDueDate({ key: "hvac_filter", intervalDays: 90, now });
  const second = initialDueDate({ key: "hvac_filter", intervalDays: 90, now });
  check("the spread is deterministic", dayKey(first) === dayKey(second));

  // Short-interval tasks shouldn't be pushed weeks out.
  const pool = initialDueDate({ key: "pool_service", intervalDays: 7, now });
  check(
    "a weekly task isn't pushed far into the future",
    daysBetween(now, pool) <= 7,
    `${daysBetween(now, pool)} days`
  );
}

// --- 4. California property tax --------------------------------------------

section("4. California's property tax installments");
{
  const schedule = taxScheduleFor("CA")!;
  check("CA is marked verified", schedule.verified);
  check("CA has two installments", schedule.installments.length === 2);

  // From September, the next deadline is the Dec 10 delinquency.
  const fromSeptember = nextTaxDeadline("CA", utcDay(2027, 9, 1))!;
  check(
    "from September, the next deadline is Dec 10",
    dayKey(fromSeptember.date) === "2027-12-10",
    dayKey(fromSeptember.date)
  );
  check(
    "and it reports the nominal Nov 1 due date alongside it",
    dayKey(fromSeptember.dueDate) === "2027-11-01",
    dayKey(fromSeptember.dueDate)
  );

  // From January, the next is April 10.
  const fromJanuary = nextTaxDeadline("CA", utcDay(2028, 1, 15))!;
  check(
    "from mid-January, the next deadline is Apr 10",
    dayKey(fromJanuary.date) === "2028-04-10",
    dayKey(fromJanuary.date)
  );

  // The asymmetry: Dec 10 -> Apr 10 is 4 months, Apr 10 -> Dec 10 is 8.
  const afterFirst = nextBillDueDate({
    cadence: "SPLIT_SEMIANNUAL",
    currentDue: utcDay(2027, 12, 10),
    stateCode: "CA",
    category: "PROPERTY_TAX",
  })!;
  check(
    "after the December installment, the next is April — not six months later",
    dayKey(afterFirst) === "2028-04-10",
    dayKey(afterFirst)
  );

  const afterSecond = nextBillDueDate({
    cadence: "SPLIT_SEMIANNUAL",
    currentDue: utcDay(2028, 4, 10),
    stateCode: "CA",
    category: "PROPERTY_TAX",
  })!;
  check(
    "after the April installment, the next is December",
    dayKey(afterSecond) === "2028-12-10",
    dayKey(afterSecond)
  );

  check("unknown states return no schedule rather than a guess",
    nextTaxDeadline("NY") === null && taxScheduleFor("NY") === null);

  check("tax estimate is value x rate",
    estimatedAnnualTaxCents(120_000_000, 1.25) === 1_500_000,
    String(estimatedAnnualTaxCents(120_000_000, 1.25)));
  check("no estimate without both inputs",
    estimatedAnnualTaxCents(120_000_000, null) === null &&
      estimatedAnnualTaxCents(null, 1.25) === null);
}

// --- 5. Bill recurrence -----------------------------------------------------

section("5. Bill recurrence is calendar-anchored");
{
  const monthly = nextBillDueDate({
    cadence: "MONTHLY",
    currentDue: utcDay(2027, 3, 15),
    dueDayOfMonth: 15,
  })!;
  check("monthly moves one month", dayKey(monthly) === "2027-04-15", dayKey(monthly));

  // The month-end trap: a bill due on the 31st, rolling into February.
  const monthEnd = nextBillDueDate({
    cadence: "MONTHLY",
    currentDue: utcDay(2027, 1, 31),
    dueDayOfMonth: 31,
  })!;
  check(
    "the 31st clamps to Feb 28 instead of overflowing into March",
    dayKey(monthEnd) === "2027-02-28",
    dayKey(monthEnd)
  );

  const quarterly = nextBillDueDate({
    cadence: "QUARTERLY",
    currentDue: utcDay(2027, 3, 1),
  })!;
  check("quarterly moves three months", dayKey(quarterly) === "2027-06-01", dayKey(quarterly));

  const annual = nextBillDueDate({
    cadence: "ANNUAL",
    currentDue: utcDay(2027, 6, 1),
  })!;
  check("annual moves a year", dayKey(annual) === "2028-06-01", dayKey(annual));

  check("one-off bills don't recur", nextBillDueDate({ cadence: "ONE_TIME", currentDue: utcDay(2027, 6, 1) }) === null);

  check("annualised cost: monthly x12", annualBillCents("MONTHLY", 10_000) === 120_000);
  check("annualised cost: quarterly x4", annualBillCents("QUARTERLY", 10_000) === 40_000);
  check("annualised cost: bimonthly x6", annualBillCents("BIMONTHLY", 10_000) === 60_000);
  check("a one-off contributes nothing annualised", annualBillCents("ONE_TIME", 10_000) === 0);
}

// --- 6. Price jumps ---------------------------------------------------------

section("6. Price-jump alerts don't cry wolf");
{
  // A real jump on a real bill: $180 average, now $290.
  const real = priceJump(29_000, [18_000, 17_500, 18_500, 18_000, 19_000]);
  check("a $110 jump on a $180 bill fires", real.jumped, JSON.stringify(real));

  // Percentage-only would fire here; absolute guard stops it.
  const small = priceJump(1_100, [800, 820, 790, 810]);
  check(
    "$8 to $11 does NOT fire, despite being +37%",
    !small.jumped,
    JSON.stringify(small)
  );

  // Big absolute change but small percentage — also shouldn't fire.
  const modest = priceJump(52_000, [50_000, 49_000, 51_000, 50_000]);
  check("a 4% rise on a large bill doesn't fire", !modest.jumped);

  const thin = priceJump(50_000, [10_000]);
  check("fewer than 3 data points never fires", !thin.jumped);

  check("the average is reported for context",
    real.averageCents === 18_200, String(real.averageCents));
}

// --- 7. Conditions drive the task list --------------------------------------

section("7. What the house has decides what's on the list");
{
  const plain = templatesFor(BASE_CONDITIONS);
  const keys = new Set(plain.map((entry) => entry.template.key));

  check("no softener means no salt task", !keys.has("softener_salt"));
  check("no pool means no pool service", !keys.has("pool_service"));
  check("no septic means no pump-out", !keys.has("septic_pump"));
  check("everyone still gets the HVAC filter", keys.has("hvac_filter"));
  check("everyone still gets smoke alarm testing", keys.has("smoke_alarm_test"));
  check("everyone gets the IoT firmware check", keys.has("iot_firmware"));

  const equipped = templatesFor({
    ...BASE_CONDITIONS,
    hasWaterSoftener: true,
    hasPool: true,
    hasSepticTank: true,
    hasFireplace: true,
  });
  const equippedKeys = new Set(equipped.map((entry) => entry.template.key));
  check("adding a softener adds the salt task", equippedKeys.has("softener_salt"));
  check("adding a fireplace adds the chimney sweep", equippedKeys.has("chimney_sweep"));

  // Interval adjustments.
  const dusty = templatesFor({ ...BASE_CONDITIONS, dustyOrSmoky: true });
  const dustyFilter = dusty.find((entry) => entry.template.key === "hvac_filter")!;
  check(
    "wildfire smoke halves the air filter interval (90 -> 45)",
    dustyFilter.intervalDays === 45,
    String(dustyFilter.intervalDays)
  );
  check("and explains why", Boolean(dustyFilter.adjustmentReason), dustyFilter.adjustmentReason);

  const hard = templatesFor({ ...BASE_CONDITIONS, hasWaterSoftener: true, hardWater: true });
  const salt = hard.find((entry) => entry.template.key === "softener_salt")!;
  check(
    "hard water shortens the salt interval (56 -> 42)",
    salt.intervalDays === 42,
    String(salt.intervalDays)
  );
  const flush = hard.find((entry) => entry.template.key === "water_heater_flush")!;
  check(
    "hard water doubles water heater flushing (365 -> 183)",
    flush.intervalDays === 183,
    String(flush.intervalDays)
  );

  const trees = templatesFor({ ...BASE_CONDITIONS, heavyTreeCover: true });
  const gutters = trees.find((entry) => entry.template.key === "gutters")!;
  check("tree cover doubles gutter cleaning (182 -> 91)", gutters.intervalDays === 91,
    String(gutters.intervalDays));
  check("tree cover adds tree trimming",
    trees.some((entry) => entry.template.key === "tree_trim"));

  check("every template explains why it matters",
    TASK_TEMPLATES.every((template) => template.why.length > 20));
  check("annual cost math: a $25 filter every 90 days is ~$101/yr",
    annualCostCents(90, 2_500) === 10_139, String(annualCostCents(90, 2_500)));
}

// --- 8. Equipment -----------------------------------------------------------

section("8. Equipment age and warranty");
{
  const now = utcDay(2027, 6, 1);

  const oldHeater = assessEquipment({
    kind: "WATER_HEATER",
    installedOn: utcDay(2013, 1, 1),
    warrantyExpiresOn: null,
    expectedLifeYears: null,
    now,
  });
  check("a 14-year-old water heater reads as past its life",
    oldHeater.health === "PAST_LIFE", oldHeater.health);
  check("and suggests getting a quote before it fails",
    oldHeater.advice.some((line) => line.toLowerCase().includes("quote")),
    oldHeater.advice.join(" | "));

  const newHeater = assessEquipment({
    kind: "WATER_HEATER",
    installedOn: utcDay(2025, 1, 1),
    warrantyExpiresOn: null,
    expectedLifeYears: null,
    now,
  });
  check("a 2-year-old one is fine", newHeater.health === "OK", newHeater.health);

  const expiring = assessEquipment({
    kind: "DISHWASHER",
    installedOn: utcDay(2025, 6, 1),
    warrantyExpiresOn: utcDay(2027, 7, 15),
    expectedLifeYears: null,
    now,
  });
  check("a warranty ending in 44 days is surfaced",
    expiring.health === "WARRANTY_EXPIRING", expiring.health);
  check("and says to raise anything now rather than later",
    expiring.advice.some((line) => line.includes("moment")));

  const alarm = assessEquipment({
    kind: "SMOKE_DETECTOR",
    installedOn: utcDay(2016, 1, 1),
    warrantyExpiresOn: null,
    expectedLifeYears: null,
    now,
  });
  check("an 11-year-old smoke detector says replace the unit, not the battery",
    alarm.advice.some((line) => line.includes("10-year")),
    alarm.advice.join(" | "));

  const camera = assessEquipment({
    kind: "CAMERA",
    installedOn: utcDay(2026, 1, 1),
    warrantyExpiresOn: null,
    expectedLifeYears: null,
    now,
  });
  check("IoT devices carry the firmware warning",
    camera.advice.some((line) => line.toLowerCase().includes("firmware")));

  const unknown = assessEquipment({
    kind: "HVAC",
    installedOn: null,
    warrantyExpiresOn: null,
    expectedLifeYears: null,
    now,
  });
  check("no install date means UNKNOWN, not a guess", unknown.health === "UNKNOWN");

  // Replacement reserve.
  const reserve = annualDepreciationCents([
    { kind: "WATER_HEATER", expectedLifeYears: null }, // 220000/11 = 20000
    { kind: "HVAC", expectedLifeYears: null }, // 1200000/18 = 66667
  ]);
  check("replacement reserve annualises across equipment",
    reserve === 20_000 + Math.round(1_200_000 / 18), String(reserve));
}

// --- 9. Detection cadence mapping ------------------------------------------

section("9. Detected charges map to sensible cadences");
{
  check("30 days is monthly, confidently", cadenceFromInterval(30).cadence === "MONTHLY" && cadenceFromInterval(30).certain);
  check("61 days is bimonthly", cadenceFromInterval(61).cadence === "BIMONTHLY" && cadenceFromInterval(61).certain);
  check("91 days is quarterly", cadenceFromInterval(91).cadence === "QUARTERLY");
  check("365 days is annual", cadenceFromInterval(365).cadence === "ANNUAL");
  check("an odd 45-day spacing is flagged as uncertain rather than rounded silently",
    !cadenceFromInterval(45).certain);
  check("a 120-day spacing is also flagged", !cadenceFromInterval(120).certain);
}

console.log(
  `\n${failed === 0 ? "[32m" : "[31m"}${passed} passed, ${failed} failed[0m\n`
);
process.exit(failed === 0 ? 0 : 1);
