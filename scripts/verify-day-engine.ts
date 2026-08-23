/**
 * Verification for the DayOS time, recurrence, rotation, leave-time, origin
 * and brief engines.
 *
 *   npm run verify:day
 *
 * No database, no network — same approach as the other three suites.
 *
 * The cases that matter, i.e. the ones where being wrong means a child is
 * standing outside a school:
 *
 *   1. A wall-clock time survives DST, in both directions
 *   2. The leave-time arithmetic matches the worked examples in the PRD
 *   3. Travel time is solved AT the departure time, not at "now"
 *   4. A re-timing alert fires on a real change and stays quiet on noise…
 *   5. …except when the new estimate says you should already have left
 *   6. A swap keeps the rota level; a cover creates a debt
 *   7. A round robin is a pure function of the calendar
 *   8. Two commitments that don't overlap on the calendar still clash once
 *      travel time is counted — the check a calendar can't do
 *   9. The origin says how confident it is
 */

import {
  parseMinuteOfDay,
  formatMinuteOfDay,
  formatClock,
  zonedTimeToUtc,
  zonedDayKey,
  zonedMinuteOfDay,
  zoneOffsetMinutes,
  describeMinutes,
  addMinutes,
} from "../src/lib/dayos/time";
import {
  expandOccurrences,
  describeWeekdays,
  parseWeekdays,
  occursOn,
  MAX_SPAN_DAYS,
  type Weekday,
} from "../src/lib/dayos/recurrence";
import {
  rosterAssigneeFor,
  resolveAssignment,
  planSwap,
  planCover,
  debtFor,
  occurrenceIndexFor,
  type Rotation,
} from "../src/lib/dayos/rotation";
import {
  computeDeparture,
  solveDeparture,
  shouldRetimeAlert,
  departureMessage,
  phaseFor,
  MAX_RETIME_ALERTS,
} from "../src/lib/dayos/leave";
import { resolveOrigin, CHAIN_SLACK_MINUTES } from "../src/lib/dayos/origin";
import { detectConflicts, composeBrief, renderBriefText, type BriefOccurrence } from "../src/lib/dayos/brief";
import { nextEscalationStep, DEFAULT_ESCALATION_POLICY } from "../src/lib/dayos/escalation";
import { utcDay } from "../src/lib/travelos/dates";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed += 1;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

function section(name: string) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

const TZ = "America/Los_Angeles";

// ---------------------------------------------------------------------------
section("Wall-clock times and time zones");
// ---------------------------------------------------------------------------

check("parses 24h, 12h and seconds forms",
  parseMinuteOfDay("17:00") === 1020 &&
  parseMinuteOfDay("5:00 PM") === 1020 &&
  parseMinuteOfDay("17:00:00") === 1020 &&
  parseMinuteOfDay("12:00 AM") === 0 &&
  parseMinuteOfDay("12:30 PM") === 750,
  `got ${parseMinuteOfDay("5:00 PM")} / ${parseMinuteOfDay("12:00 AM")} / ${parseMinuteOfDay("12:30 PM")}`);

check("rejects nonsense rather than guessing",
  parseMinuteOfDay("25:00") === null &&
  parseMinuteOfDay("17:99") === null &&
  parseMinuteOfDay("dinner") === null);

check("formats back to storage and display forms",
  formatMinuteOfDay(1020) === "17:00" && formatClock(1020) === "5:00 PM" && formatClock(0) === "12:00 AM",
  `${formatMinuteOfDay(1020)} / ${formatClock(1020)} / ${formatClock(0)}`);

// 2026: US DST starts Sun Mar 8, ends Sun Nov 1.
const janFive = zonedTimeToUtc(utcDay(2026, 1, 20), 17 * 60, TZ);
const julFive = zonedTimeToUtc(utcDay(2026, 7, 20), 17 * 60, TZ);

check("5 PM PST is 01:00Z the next day",
  janFive.toISOString() === "2026-01-21T01:00:00.000Z", janFive.toISOString());

check("5 PM PDT is 00:00Z the next day — the same wall clock, an hour earlier in UTC",
  julFive.toISOString() === "2026-07-21T00:00:00.000Z", julFive.toISOString());

check("offset is read from the IANA database, not assumed",
  zoneOffsetMinutes(janFive, TZ) === -480 && zoneOffsetMinutes(julFive, TZ) === -420,
  `${zoneOffsetMinutes(janFive, TZ)} / ${zoneOffsetMinutes(julFive, TZ)}`);

// The hour that doesn't exist: 2:00–3:00 local on 8 Mar 2026.
const springGap = zonedTimeToUtc(utcDay(2026, 3, 8), 2 * 60 + 30, TZ);
check("a spring-forward gap time resolves forward instead of throwing",
  zonedMinuteOfDay(springGap, TZ) === 3 * 60 + 30,
  `resolved to ${formatClock(zonedMinuteOfDay(springGap, TZ))}`);

// The hour that happens twice: 1:00–2:00 local on 1 Nov 2026.
const fallBack = zonedTimeToUtc(utcDay(2026, 11, 1), 1 * 60 + 30, TZ);
check("a fall-back ambiguous time picks one instant and stays on 1:30",
  zonedMinuteOfDay(fallBack, TZ) === 90, formatClock(zonedMinuteOfDay(fallBack, TZ)));

check("round trip through a zone keeps the calendar day",
  zonedDayKey(janFive, TZ) === "2026-01-20" && zonedDayKey(julFive, TZ) === "2026-07-20",
  `${zonedDayKey(janFive, TZ)} / ${zonedDayKey(julFive, TZ)}`);

check("minute descriptions read the way people speak",
  describeMinutes(12) === "in 12 min" &&
  describeMinutes(65) === "in 1 hr 5 min" &&
  describeMinutes(120) === "in 2 hr" &&
  describeMinutes(-8) === "8 min ago" &&
  describeMinutes(0.4) === "in 1 min",
  `${describeMinutes(65)} / ${describeMinutes(120)} / ${describeMinutes(0.4)}`);

// ---------------------------------------------------------------------------
section("Recurrence");
// ---------------------------------------------------------------------------

const schoolYear = {
  weekdays: [1, 2, 3, 4, 5] as Weekday[],
  effectiveFrom: utcDay(2026, 8, 24),
  effectiveTo: utcDay(2027, 6, 11),
};

const week = expandOccurrences(schoolYear, utcDay(2026, 8, 24), utcDay(2026, 8, 30));
check("Mon–Fri expands to five days in a seven-day span", week.length === 5, `got ${week.length}`);
check("weekend days are excluded", week.every((d) => d.weekday !== 0 && d.weekday !== 6));

const withBreak = expandOccurrences(
  { ...schoolYear, skipDays: [utcDay(2026, 8, 26)] },
  utcDay(2026, 8, 24),
  utcDay(2026, 8, 30)
);
check("a skip day removes exactly one occurrence", withBreak.length === 4);
check("the right day was removed", !withBreak.some((d) => d.dayKey === "2026-08-26"));

const schoolOnly = expandOccurrences(
  { ...schoolYear, schoolDaysOnly: true, noSchoolDays: [utcDay(2026, 8, 25), utcDay(2026, 8, 27)] },
  utcDay(2026, 8, 24),
  utcDay(2026, 8, 30)
);
check("no-school days drop out when schoolDaysOnly is set", schoolOnly.length === 3, `got ${schoolOnly.length}`);

check("nothing expands before the effective start",
  expandOccurrences(schoolYear, utcDay(2026, 8, 17), utcDay(2026, 8, 21)).length === 0);

check("nothing expands after the effective end",
  expandOccurrences(schoolYear, utcDay(2027, 6, 14), utcDay(2027, 6, 18)).length === 0);

const oneOff = {
  weekdays: [] as Weekday[],
  effectiveFrom: utcDay(2026, 9, 15),
  effectiveTo: utcDay(2026, 9, 15),
};
check("an empty weekday set means a single-date activity",
  expandOccurrences(oneOff, utcDay(2026, 9, 1), utcDay(2026, 9, 30)).length === 1);

let guarded = false;
try {
  expandOccurrences(schoolYear, utcDay(2026, 1, 1), utcDay(2030, 1, 1));
} catch {
  guarded = true;
}
check(`an unbounded expansion is refused past ${MAX_SPAN_DAYS} days`, guarded);

check("occursOn agrees with the expansion",
  occursOn(schoolYear, utcDay(2026, 8, 25)) && !occursOn(schoolYear, utcDay(2026, 8, 29)));

check("weekday sets read as ranges, not lists",
  describeWeekdays([1, 2, 3, 4, 5]) === "Mon–Fri" &&
  describeWeekdays([2, 4]) === "Tue & Thu" &&
  describeWeekdays([3]) === "Wed" &&
  describeWeekdays([0, 6]) === "Weekends" &&
  describeWeekdays([1, 2, 3]) === "Mon–Wed",
  `${describeWeekdays([2, 4])} / ${describeWeekdays([1, 2, 3])}`);

check("weekday CSV parses and de-duplicates", parseWeekdays("1,2,2,5,9,x").join(",") === "1,2,5");

// ---------------------------------------------------------------------------
section("Responsibility rotation");
// ---------------------------------------------------------------------------

const NAMES: Record<string, string> = {
  ravi: "Ravi", divya: "Divya", parentA: "Parent A", parentB: "Parent B",
};
const nameOf = (id: string) => NAMES[id] ?? id;

const carpool: Rotation = {
  id: "carpool",
  kind: "FIXED_WEEKDAY",
  anchorDay: utcDay(2026, 8, 24),
  slots: [
    { weekday: 1, orderIndex: 0, assigneeId: "ravi" },
    { weekday: 2, orderIndex: 1, assigneeId: "parentA" },
    { weekday: 3, orderIndex: 2, assigneeId: "divya" },
    { weekday: 4, orderIndex: 3, assigneeId: "parentB" },
    { weekday: 5, orderIndex: 4, assigneeId: "ravi" },
  ],
};

check("a fixed-weekday rota answers by weekday",
  rosterAssigneeFor(carpool, utcDay(2026, 8, 24), 0) === "ravi" &&
  rosterAssigneeFor(carpool, utcDay(2026, 8, 26), 2) === "divya" &&
  rosterAssigneeFor(carpool, utcDay(2026, 8, 28), 4) === "ravi");

check("a weekday with no slot is unassigned rather than wrong",
  rosterAssigneeFor(carpool, utcDay(2026, 8, 29), 5) === null);

const roundRobin: Rotation = {
  id: "rr",
  kind: "ROUND_ROBIN",
  anchorDay: utcDay(2026, 8, 24),
  slots: [
    { orderIndex: 0, assigneeId: "ravi" },
    { orderIndex: 1, assigneeId: "divya" },
    { orderIndex: 2, assigneeId: "parentA" },
  ],
};

const rrDays = expandOccurrences(
  { weekdays: [1, 3, 5] as Weekday[], effectiveFrom: utcDay(2026, 8, 24), effectiveTo: null },
  utcDay(2026, 8, 24),
  utcDay(2026, 9, 18)
).map((d) => d.day);

const rrFirstPass = rrDays.map((d) => rosterAssigneeFor(roundRobin, d, occurrenceIndexFor(rrDays, d)));
const rrSecondPass = rrDays.map((d) => rosterAssigneeFor(roundRobin, d, occurrenceIndexFor(rrDays, d)));

check("a round robin advances one step per occurrence",
  rrFirstPass.slice(0, 4).join(",") === "ravi,divya,parentA,ravi", rrFirstPass.slice(0, 4).join(","));
check("a round robin is reproducible — recomputing gives the same answer",
  rrFirstPass.join(",") === rrSecondPass.join(","));
check("a round robin wraps cleanly past the roster length",
  rrFirstPass[3] === "ravi" && rrFirstPass[6] === "ravi");

// Cover vs swap — the fairness distinction.
const wednesday = utcDay(2026, 8, 26);
const friday = utcDay(2026, 8, 28);

const cover = planCover(carpool, wednesday, 2, "ravi", "Divya has a late meeting");
const coveredAssignment = resolveAssignment(carpool, wednesday, 2, [cover], nameOf);
check("a cover reassigns the day and names who it was for",
  coveredAssignment.assigneeId === "ravi" &&
  coveredAssignment.source === "COVER" &&
  coveredAssignment.rosterAssigneeId === "divya" &&
  coveredAssignment.reason.includes("covering for Divya"),
  coveredAssignment.reason);

const swap = planSwap(carpool, wednesday, 2, friday, 4, "school run swap");
check("a swap produces both halves of the exchange", swap !== null && swap.length === 2);
const swapped = swap!;
check("the swap exchanges the two assignees",
  swapped[0].assigneeId === "ravi" && swapped[1].assigneeId === "divya",
  `${swapped[0].assigneeId} / ${swapped[1].assigneeId}`);

const weekDays = [
  utcDay(2026, 8, 24), utcDay(2026, 8, 25), wednesday, utcDay(2026, 8, 27), friday,
];
const withSwap = weekDays.map((d, i) => resolveAssignment(carpool, d, i, swapped, nameOf));
const withCover = weekDays.map((d, i) => resolveAssignment(carpool, d, i, [cover], nameOf));

const swapDebt = debtFor(withSwap);
const coverDebt = debtFor(withCover);
const net = (rows: typeof swapDebt, id: string) => rows.find((r) => r.assigneeId === id)?.net ?? 0;

check("a swap leaves nobody owing anybody",
  swapDebt.every((row) => row.net === 0),
  swapDebt.map((r) => `${r.assigneeId}:${r.net}`).join(" "));

check("a cover leaves a real debt on the books",
  net(coverDebt, "ravi") === 1 && net(coverDebt, "divya") === -1,
  coverDebt.map((r) => `${r.assigneeId}:${r.net}`).join(" "));

check("a swap between the same person is refused rather than recorded",
  planSwap(carpool, utcDay(2026, 8, 24), 0, friday, 4) === null);

// ---------------------------------------------------------------------------
section("Leave-time engine");
// ---------------------------------------------------------------------------

// PRD §9: appointment 5:00 PM, 27 min travel, 10 min buffer -> leave 4:23 PM.
const prdNine = computeDeparture({
  eventStartAt: zonedTimeToUtc(utcDay(2026, 9, 15), 17 * 60, TZ),
  travelMinutes: 27,
  arrivalBufferMinutes: 10,
  now: zonedTimeToUtc(utcDay(2026, 9, 15), 15 * 60, TZ),
});
check("PRD §9 worked example: 5:00 PM − 27 − 10 = leave 4:23 PM",
  zonedMinuteOfDay(prdNine.leaveAt, TZ) === 16 * 60 + 23,
  formatClock(zonedMinuteOfDay(prdNine.leaveAt, TZ)));
check("PRD §9: arrival target is 4:50 PM",
  zonedMinuteOfDay(prdNine.arriveBy, TZ) === 16 * 60 + 50,
  formatClock(zonedMinuteOfDay(prdNine.arriveBy, TZ)));

// PRD §20: math class 4:30 PM, 24 min travel, 10 min buffer -> leave 3:56 PM.
const prdTwenty = computeDeparture({
  eventStartAt: zonedTimeToUtc(utcDay(2026, 9, 16), 16 * 60 + 30, TZ),
  travelMinutes: 24,
  arrivalBufferMinutes: 10,
  now: zonedTimeToUtc(utcDay(2026, 9, 16), 15 * 60 + 45, TZ),
});
check("PRD §20 worked example: leave by 3:56 PM, arrive by 4:20 PM",
  zonedMinuteOfDay(prdTwenty.leaveAt, TZ) === 15 * 60 + 56 &&
  zonedMinuteOfDay(prdTwenty.arriveBy, TZ) === 16 * 60 + 20,
  `${formatClock(zonedMinuteOfDay(prdTwenty.leaveAt, TZ))} / ${formatClock(zonedMinuteOfDay(prdTwenty.arriveBy, TZ))}`);

check("prep time sits before the departure, not inside it",
  Math.round((prdTwenty.leaveAt.getTime() - prdTwenty.readyAt.getTime()) / 60000) === 10);

check("phases move in the right order as the clock runs",
  phaseFor(60, 120) === "SCHEDULED" &&
  phaseFor(12, 60) === "PREPARE" &&
  phaseFor(2, 40) === "DRIVE_NOW" &&
  phaseFor(-3, 35) === "DRIVE_NOW" &&
  phaseFor(-30, 10) === "RUNNING_LATE" &&
  phaseFor(-90, -5) === "PASSED",
  `${phaseFor(12, 60)} / ${phaseFor(-3, 35)} / ${phaseFor(-30, 10)}`);

check("a late plan reports how late, not just that it's late",
  Math.round(
    computeDeparture({
      eventStartAt: zonedTimeToUtc(utcDay(2026, 9, 16), 16 * 60 + 30, TZ),
      travelMinutes: 24,
      arrivalBufferMinutes: 10,
      now: zonedTimeToUtc(utcDay(2026, 9, 16), 16 * 60 + 20, TZ),
    }).lateByMinutes
  ) === 14);

// The fixed point.
let probes: Date[] = [];
const rushHourCurve = (departAt: Date) => {
  probes.push(departAt);
  return zonedMinuteOfDay(departAt, TZ) >= 16 * 60 ? 40 : 20;
};

probes = [];
const solved = solveDeparture(
  {
    eventStartAt: zonedTimeToUtc(utcDay(2026, 9, 16), 17 * 60, TZ),
    arrivalBufferMinutes: 10,
    now: zonedTimeToUtc(utcDay(2026, 9, 16), 14 * 60, TZ),
  },
  rushHourCurve
);
check("travel time is estimated FOR the departure, not for now",
  probes.length >= 2 && zonedMinuteOfDay(probes[0], TZ) === 16 * 60 + 50,
  `probed at ${probes.map((p) => formatClock(zonedMinuteOfDay(p, TZ))).join(", ")}`);
check("the fixed point settles on the rush-hour estimate",
  solved.converged && solved.travelMinutes === 40 &&
  zonedMinuteOfDay(solved.leaveAt, TZ) === 16 * 60 + 10,
  `${solved.travelMinutes} min, leave ${formatClock(zonedMinuteOfDay(solved.leaveAt, TZ))}, converged=${solved.converged}`);

// A curve that oscillates across the boundary must still terminate.
probes = [];
const oscillating = solveDeparture(
  {
    eventStartAt: zonedTimeToUtc(utcDay(2026, 9, 16), 17 * 60, TZ),
    arrivalBufferMinutes: 10,
    now: zonedTimeToUtc(utcDay(2026, 9, 16), 14 * 60, TZ),
  },
  (departAt) => {
    probes.push(departAt);
    return zonedMinuteOfDay(departAt, TZ) >= 16 * 60 + 30 ? 45 : 20;
  }
);
check("an oscillating traffic curve terminates instead of looping",
  probes.length <= 3 && oscillating.leaveAt instanceof Date,
  `${probes.length} probes, converged=${oscillating.converged}`);
check("a non-converged solve says so rather than pretending", !oscillating.converged);

// ---------------------------------------------------------------------------
section("Re-timing alerts");
// ---------------------------------------------------------------------------

const now = zonedTimeToUtc(utcDay(2026, 9, 16), 15 * 60, TZ);
const eventAt = zonedTimeToUtc(utcDay(2026, 9, 16), 16 * 60 + 30, TZ);
const planWith = (travel: number, at: Date = now) =>
  computeDeparture({ eventStartAt: eventAt, travelMinutes: travel, arrivalBufferMinutes: 10, now: at });

check("a 3-minute wobble is not worth a message",
  shouldRetimeAlert({ previous: planWith(24), current: planWith(27), alertsAlreadySent: 0, now }).notify === false);

check("8 minutes on a 24-minute drive is",
  shouldRetimeAlert({ previous: planWith(24), current: planWith(32), alertsAlreadySent: 0, now }).notify === true);

check("8 minutes on a 90-minute drive is not — the ratio floor holds",
  shouldRetimeAlert({ previous: planWith(90), current: planWith(98), alertsAlreadySent: 0, now }).notify === false);

check("traffic clearing is reported too, not just traffic worsening",
  (() => {
    const v = shouldRetimeAlert({ previous: planWith(40), current: planWith(24), alertsAlreadySent: 0, now });
    return v.notify === true && v.direction === "BETTER";
  })());

check(`the send cap stops a third routine update`,
  shouldRetimeAlert({
    previous: planWith(24), current: planWith(40), alertsAlreadySent: MAX_RETIME_ALERTS, now,
  }).notify === false);

// The override: at 3:45 PM the planned 3:56 departure is still ahead, but a
// jump from 24 to 45 minutes moves it to 3:35 — already gone. That must send
// even though the send cap is spent.
const late = zonedTimeToUtc(utcDay(2026, 9, 16), 15 * 60 + 45, TZ);
const urgent = shouldRetimeAlert({
  previous: planWith(24, late),
  current: planWith(45, late),
  alertsAlreadySent: MAX_RETIME_ALERTS,
  now: late,
});
check("a departure pushed into the past overrides the send cap",
  urgent.notify === true && urgent.urgent === true,
  JSON.stringify(urgent));

check("nothing is sent about an event that already started",
  shouldRetimeAlert({
    previous: planWith(24, addMinutes(eventAt, 30)),
    current: planWith(60, addMinutes(eventAt, 30)),
    alertsAlreadySent: 0,
    now: addMinutes(eventAt, 30),
  }).notify === false);

// ---------------------------------------------------------------------------
section("Origin inference");
// ---------------------------------------------------------------------------

const HOME = { id: "home", label: "Home", address: "1 Main St" };
const WORK = { id: "work", label: "Work", address: "500 Office Pkwy" };
const SCHOOL = { id: "school", label: "Mission Hills School", address: "9 School Rd" };

const baseOrigin = {
  leaveAt: zonedTimeToUtc(utcDay(2026, 9, 16), 15 * 60, TZ),
  leaveWeekday: 3,
  leaveMinuteOfDay: 15 * 60,
  homePlace: HOME,
  workPlace: WORK,
  workingHours: { weekdays: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 17 * 60 },
};

const chained = resolveOrigin({
  ...baseOrigin,
  priorCommitments: [
    { id: "mtg", place: SCHOOL, endsAt: zonedTimeToUtc(utcDay(2026, 9, 16), 14 * 60 + 40, TZ) },
  ],
});
check("a commitment ending 20 min before departure chains the origin",
  chained.confidence === "CHAINED" && chained.place?.id === "school", chained.explanation);

const notChained = resolveOrigin({
  ...baseOrigin,
  priorCommitments: [
    { id: "mtg", place: SCHOOL, endsAt: zonedTimeToUtc(utcDay(2026, 9, 16), 12 * 60, TZ) },
  ],
});
check(`a commitment ending more than ${CHAIN_SLACK_MINUTES} min before does not chain`,
  notChained.confidence === "SCHEDULE" && notChained.place?.id === "work", notChained.explanation);

check("mid-workday with no prior commitment assumes work, and says 'assuming'",
  resolveOrigin({ ...baseOrigin, priorCommitments: [] }).explanation.startsWith("Assuming"));

check("outside working hours it falls back to home",
  resolveOrigin({ ...baseOrigin, priorCommitments: [], leaveMinuteOfDay: 19 * 60 }).confidence === "DEFAULT");

check("a weekend falls back to home even at 3 PM",
  resolveOrigin({ ...baseOrigin, priorCommitments: [], leaveWeekday: 6 }).confidence === "DEFAULT");

check("no home address is reported as the blocker it is",
  resolveOrigin({ ...baseOrigin, priorCommitments: [], homePlace: null, workPlace: null })
    .explanation.includes("add Home"));

// ---------------------------------------------------------------------------
section("Conflicts and the brief");
// ---------------------------------------------------------------------------

const occ = (
  over: Partial<BriefOccurrence> & Pick<BriefOccurrence, "id" | "activityName" | "startAt">
): BriefOccurrence => ({
  subjectName: null,
  responsibleId: "ravi",
  responsibleName: "Ravi",
  endAt: null,
  placeLabel: null,
  travelRequired: true,
  plan: null,
  origin: null,
  requiresConfirmation: false,
  confirmed: false,
  ...over,
});

// The flagship case: a meeting that ends at 3:00 and a 3:15 pickup 25 minutes
// away. No calendar on earth flags this. It is a clash.
const meetingEnd = zonedTimeToUtc(utcDay(2026, 9, 16), 15 * 60, TZ);
const pickupStart = zonedTimeToUtc(utcDay(2026, 9, 16), 15 * 60 + 15, TZ);
const pickupPlan = computeDeparture({
  eventStartAt: pickupStart, travelMinutes: 25, arrivalBufferMinutes: 5, now: meetingEnd,
});

const clashes = detectConflicts([
  occ({ id: "mtg", activityName: "Design review", startAt: zonedTimeToUtc(utcDay(2026, 9, 16), 14 * 60, TZ), endAt: meetingEnd, travelRequired: false }),
  occ({ id: "pickup", activityName: "School pickup", subjectName: "Ayuktha", startAt: pickupStart, plan: pickupPlan }),
]);
check("a calendar-clean day is still a clash once travel is counted",
  clashes.length === 1 && clashes[0].severity === "CLASH",
  clashes.map((c) => `${c.severity}: ${c.message}`).join(" | "));
check("the clash message states the overlap in minutes",
  clashes[0].message.includes("overlap by 15 min"), clashes[0].message);

const tight = detectConflicts([
  occ({ id: "a", activityName: "Dentist", startAt: zonedTimeToUtc(utcDay(2026, 9, 16), 13 * 60, TZ), endAt: zonedTimeToUtc(utcDay(2026, 9, 16), 14 * 60, TZ), travelRequired: false }),
  occ({
    id: "b", activityName: "Math class", subjectName: "Ayuktha",
    startAt: zonedTimeToUtc(utcDay(2026, 9, 16), 14 * 60 + 30, TZ),
    plan: computeDeparture({
      eventStartAt: zonedTimeToUtc(utcDay(2026, 9, 16), 14 * 60 + 30, TZ),
      travelMinutes: 15, arrivalBufferMinutes: 5, now: meetingEnd,
    }),
  }),
]);
check("a 10-minute turnaround is flagged as tight, not as a clash",
  tight.length === 1 && tight[0].severity === "TIGHT" && tight[0].gapMinutes === 10,
  tight.map((c) => `${c.severity} gap=${c.gapMinutes}`).join(" | "));

check("two people each with one commitment is not a conflict",
  detectConflicts([
    occ({ id: "a", activityName: "Pickup", startAt: pickupStart, plan: pickupPlan }),
    occ({ id: "b", activityName: "Dance", responsibleId: "divya", responsibleName: "Divya", startAt: pickupStart, plan: pickupPlan }),
  ]).length === 0);

check("an unassigned occurrence can't conflict with anything",
  detectConflicts([
    occ({ id: "a", activityName: "Pickup", responsibleId: null, responsibleName: null, startAt: pickupStart, plan: pickupPlan }),
    occ({ id: "b", activityName: "Dance", responsibleId: null, responsibleName: null, startAt: pickupStart, plan: pickupPlan }),
  ]).length === 0);

const brief = composeBrief(
  [
    occ({ id: "drop", activityName: "School drop-off", subjectName: "Ayuktha", startAt: zonedTimeToUtc(utcDay(2026, 9, 16), 8 * 60, TZ) }),
    occ({ id: "pickup", activityName: "School pickup", subjectName: "Ayuktha", responsibleId: "divya", responsibleName: "Divya", startAt: pickupStart, plan: pickupPlan, placeLabel: "Mission Hills School" }),
    occ({ id: "dance", activityName: "Dance class", subjectName: "Ayuktha", responsibleId: null, responsibleName: null, startAt: zonedTimeToUtc(utcDay(2026, 9, 16), 17 * 60, TZ), requiresConfirmation: true }),
  ],
  {
    recipientId: "ravi",
    recipientFirstName: "Ravi",
    timeZone: TZ,
    now: zonedTimeToUtc(utcDay(2026, 9, 16), 7 * 60 + 30, TZ),
    dayLabel: "today",
  }
);

check("the brief is ordered by start time",
  brief.lines.map((l) => l.occurrenceId).join(",") === "drop,pickup,dance",
  brief.lines.map((l) => l.occurrenceId).join(","));
check("the brief separates out what the reader is personally down for",
  brief.yours.length === 1 && brief.yours[0].occurrenceId === "drop");
check("the brief surfaces what nobody has picked up",
  brief.unassigned.length === 1 && brief.unassigned[0].occurrenceId === "dance");
check("the brief names the next departure and how long away it is",
  brief.nextDeparture?.occurrenceId === "pickup" && brief.nextDeparture.leaveClock === "2:45 PM",
  JSON.stringify(brief.nextDeparture));
check("the greeting matches the hour in the household's zone",
  brief.greeting === "Good morning, Ravi.", brief.greeting);

const text = renderBriefText(brief);
check("the rendered brief states the unassigned activity in words",
  text.includes("Nobody is down for: Ayuktha's Dance class."), text.split("\n").slice(-4).join(" / "));

check("an empty day says so instead of rendering an empty list",
  renderBriefText(
    composeBrief([], { recipientId: "ravi", recipientFirstName: "Ravi", timeZone: TZ, now, dayLabel: "today" })
  ).includes("Nothing scheduled"));

// ---------------------------------------------------------------------------
section("Confirmation and escalation");
// ---------------------------------------------------------------------------

const leaveAt = zonedTimeToUtc(utcDay(2026, 9, 16), 15 * 60, TZ);
const at = (minutesBefore: number) => addMinutes(leaveAt, -minutesBefore);
const ladder = (over: Partial<Parameters<typeof nextEscalationStep>[0]>) =>
  nextEscalationStep({
    requiresConfirmation: true,
    state: "PENDING",
    sent: [],
    leaveAt,
    now: at(60),
    hasOtherAdults: true,
    hasGroup: true,
    ...over,
  });

check("nothing fires before the first ask window",
  ladder({ now: at(DEFAULT_ESCALATION_POLICY.askLeadMinutes + 30) }).act === false);

check("the first ask fires inside its window and asks for a reply",
  (() => { const a = ladder({ now: at(100) }); return a.act && a.rung === "ASK" && a.requestReply; })());

check("a reminder only fires after the ask has gone out",
  (() => { const a = ladder({ now: at(30), sent: ["ASK"] }); return a.act && a.rung === "REMIND"; })());

check("silence escalates to the other adults, not to the group",
  (() => { const a = ladder({ now: at(20), sent: ["ASK", "REMIND"] }); return a.act && a.rung === "ESCALATE" && a.audience === "OTHER_ADULTS"; })());

check("a decline asks the group immediately, without waiting for a clock",
  (() => { const a = ladder({ state: "DECLINED", now: at(200), sent: ["ASK"] }); return a.act && a.rung === "BROADCAST" && a.audience === "GROUP"; })());

check("a decline with nobody to ask goes straight to uncovered",
  (() => {
    const a = ladder({ state: "DECLINED", now: at(200), sent: ["ASK"], hasGroup: false, hasOtherAdults: false });
    return a.act && a.rung === "UNCOVERED";
  })());

check("an unanswered broadcast becomes an uncovered alert near departure",
  (() => { const a = ladder({ state: "DECLINED", now: at(5), sent: ["ASK", "BROADCAST"] }); return a.act && a.rung === "UNCOVERED"; })());

check("a confirmed responsibility stops the ladder dead",
  ladder({ state: "CONFIRMED", now: at(5), sent: ["ASK"] }).act === false);

check("activities that don't ask for confirmation never enter the ladder",
  ladder({ requiresConfirmation: false, now: at(5) }).act === false);

check("each rung fires at most once",
  ladder({ now: at(100), sent: ["ASK"] }).act === false);

// ---------------------------------------------------------------------------
section("Message copy");
// ---------------------------------------------------------------------------

const msgCtx = { activityName: "math class", subjectName: "Ayuktha", destinationLabel: "the Math Center", timeZone: TZ };

check("the prepare message says when to leave and how far it is",
  departureMessage(
    computeDeparture({ eventStartAt: zonedTimeToUtc(utcDay(2026, 9, 16), 16 * 60 + 30, TZ), travelMinutes: 24, arrivalBufferMinutes: 10, now: zonedTimeToUtc(utcDay(2026, 9, 16), 15 * 60 + 46, TZ) }),
    msgCtx
  ) === "Heads up — leave in 10 min for Ayuktha's math class (3:56 PM). 24 min drive at the Math Center.",
  departureMessage(
    computeDeparture({ eventStartAt: zonedTimeToUtc(utcDay(2026, 9, 16), 16 * 60 + 30, TZ), travelMinutes: 24, arrivalBufferMinutes: 10, now: zonedTimeToUtc(utcDay(2026, 9, 16), 15 * 60 + 46, TZ) }),
    msgCtx
  ));

check("the drive-now message states the arrival, not just the instruction",
  departureMessage(
    computeDeparture({ eventStartAt: zonedTimeToUtc(utcDay(2026, 9, 16), 16 * 60 + 30, TZ), travelMinutes: 24, arrivalBufferMinutes: 10, now: zonedTimeToUtc(utcDay(2026, 9, 16), 15 * 60 + 56, TZ) }),
    msgCtx
  ).includes("gets you there by 4:20 PM"));

// ---------------------------------------------------------------------------
console.log(
  `\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m (${passed + failed} assertions)\n`
);
if (failed > 0) process.exit(1);
