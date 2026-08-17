/**
 * Verification for the TravelOS calendar parsing and window engine.
 *
 *   npm run verify:travel
 *
 * No database, no network, no API keys. The parsers are pure functions over
 * text and the window engine is a pure function over a household, so the whole
 * chain from "an .ics file" to "ranked travel windows" can be asserted here.
 *
 * The cases that matter — the ones where being wrong sends a family to the
 * airport on a school day:
 *
 *   1. ICS DTEND is exclusive          — the classic off-by-one-day bug
 *   2. Timezone stability              — a date is a calendar day, not an instant
 *   3. Sibling intersection            — different schools, common days only
 *   4. Weekend bridging                — a Fri-Mon break is one window, not two
 *   5. PTO cost excludes holidays      — Memorial Day isn't a PTO day
 *   6. Blackouts demote, not delete    — the window stays, with the reason
 *   7. Federal holidays are computed   — no expiring hardcoded table
 *   8. Determinism
 */

import { parseIcs, parseCsv, classifyTitle } from "../src/lib/travelos/calendar/parse";
import { generateWindows } from "../src/lib/travelos/windows";
import { federalHolidays } from "../src/lib/travelos/holidays";
import { assessSeason, workingDaysIn } from "../src/lib/travelos/seasonality";
import { dayKey, utcDay, inclusiveDayCount } from "../src/lib/travelos/dates";

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

// --- 1. ICS parsing ---------------------------------------------------------

section("1. ICS parsing handles the format's traps");
{
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "SUMMARY:Spring Break",
    "DTSTART;VALUE=DATE:20270322",
    "DTEND;VALUE=DATE:20270327",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Presidents Day",
    "DTSTART;VALUE=DATE:20270215",
    "DTEND;VALUE=DATE:20270216",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Teacher In-Service Day - No School for",
    "  Students",
    "DTSTART;VALUE=DATE:20270305",
    "DTEND;VALUE=DATE:20270306",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "SUMMARY:Early Release Day",
    "DTSTART;VALUE=DATE:20270410",
    "DTEND;VALUE=DATE:20270411",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const result = parseIcs(ics);
  const spring = result.entries.find((e) => e.title === "Spring Break");
  const presidents = result.entries.find((e) => e.title.includes("Presidents"));
  const folded = result.entries.find((e) => e.title.includes("In-Service"));
  const early = result.entries.find((e) => e.title.includes("Early Release"));

  check("parses all four events", result.entries.length === 4, `got ${result.entries.length}`);

  // DTEND 20270327 is EXCLUSIVE, so the break really ends on the 26th.
  check(
    "all-day DTEND is treated as exclusive (Mar 22-26, not 22-27)",
    spring != null && dayKey(spring.endDate) === "2027-03-26",
    spring ? `got ${dayKey(spring.endDate)}` : "missing"
  );
  check(
    "a 5-day break counts as 5 days",
    spring != null && inclusiveDayCount(spring.startDate, spring.endDate) === 5,
    spring ? String(inclusiveDayCount(spring.startDate, spring.endDate)) : "missing"
  );
  check(
    "a single-day holiday stays a single day",
    presidents != null && dayKey(presidents.startDate) === dayKey(presidents.endDate)
  );
  check(
    "RFC 5545 line folding is unfolded (title isn't truncated)",
    folded != null && folded.title.includes("Students"),
    folded?.title
  );
  check("teacher in-service is classified as no-school", folded?.noSchool === true);
  check(
    "early release is NOT a day off — you can't fly on it",
    early != null && early.kind === "EARLY_RELEASE" && early.noSchool === false
  );
}

// --- 2. Timezone stability --------------------------------------------------

section("2. A calendar date is a day, not an instant");
{
  const original = process.env.TZ;
  const results: string[] = [];

  for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati"]) {
    process.env.TZ = tz;
    const parsed = parseIcs(
      ["BEGIN:VEVENT", "SUMMARY:Winter Break", "DTSTART;VALUE=DATE:20261221", "DTEND;VALUE=DATE:20270102", "END:VEVENT"].join("\r\n")
    );
    results.push(dayKey(parsed.entries[0].startDate));
  }
  process.env.TZ = original;

  check(
    "the same file yields the same start date in every timezone",
    new Set(results).size === 1 && results[0] === "2026-12-21",
    results.join(" / ")
  );
}

// --- 3. CSV + classification ------------------------------------------------

section("3. CSV parsing and title classification");
{
  const csv = [
    "Date,End Date,Event",
    "2027-03-22,2027-03-26,Spring Break",
    '2027-05-31,,"Memorial Day, observed"',
    "2027-09-06,,Labor Day",
    "not-a-date,,Broken row",
  ].join("\n");

  const result = parseCsv(csv);
  check("reads the well-formed rows", result.entries.length === 3, `got ${result.entries.length}`);
  check("quoted field containing a comma stays intact",
    result.entries.some((e) => e.title === "Memorial Day, observed"));
  check("a malformed row is reported, not silently dropped", result.warnings.length === 1);

  check("'Winter Break' classifies as BREAK", classifyTitle("Winter Break").kind === "BREAK");
  check("'Staff Development Day' classifies as TEACHER_DAY",
    classifyTitle("Staff Development Day").kind === "TEACHER_DAY");
  check("'Minimum Day' is an early release, not a day off",
    classifyTitle("Minimum Day").noSchool === false);
  check("'No School - Parent Conferences' is a day off",
    classifyTitle("No School - Parent Conferences").noSchool === true);
}

// --- 4. Sibling intersection ------------------------------------------------

section("4. Two schools: only the days BOTH children are off count");
{
  const now = utcDay(2027, 1, 4);

  const windows = generateWindows({
    now,
    children: [
      {
        childId: "a",
        childName: "Maya",
        entries: [
          { startDate: utcDay(2027, 3, 22), endDate: utcDay(2027, 3, 26), title: "Spring Break", kind: "BREAK", noSchool: true },
        ],
      },
      {
        childId: "b",
        childName: "Rohan",
        entries: [
          // Overlaps by three days only: Mar 24, 25, 26.
          { startDate: utcDay(2027, 3, 24), endDate: utcDay(2027, 3, 31), title: "Spring Break", kind: "BREAK", noSchool: true },
        ],
      },
    ],
    adults: [{ memberId: "p1", name: "Alex", ptoDaysRemaining: 15 }],
    blackouts: [],
  });

  const spring = windows.find((w) => w.startDate.getTime() === utcDay(2027, 3, 24).getTime());

  // Mar 22-23: only Maya is off, so those days are NOT shared and the weekend
  // before them (Mar 20-21) is stranded as a weekend-only run, which the
  // engine correctly discards. The shared stretch is Wed Mar 24 through the
  // following Sunday.
  check("a window exists for the overlap", spring != null,
    windows.map((w) => `${dayKey(w.startDate)}→${dayKey(w.endDate)}`).join(", "));
  check(
    "it starts on Mar 24, the first day BOTH are off (not Maya's Mar 22)",
    spring != null && dayKey(spring.startDate) === "2027-03-24",
    spring ? dayKey(spring.startDate) : "missing"
  );
  check(
    "it ends Mar 28, not Rohan's Mar 31 (Maya is back at school on the 29th)",
    spring != null && dayKey(spring.endDate) === "2027-03-28",
    spring ? dayKey(spring.endDate) : "missing"
  );
  check(
    "the shared window is 5 days, not the 8 Rohan alone would have had",
    spring != null && spring.totalDays === 5,
    spring ? `${spring.totalDays} days` : "missing"
  );
  check(
    "the preceding weekend is dropped — a weekend with no shared weekday isn't a trip",
    !windows.some((w) => dayKey(w.startDate) === "2027-03-20"),
    windows.map((w) => dayKey(w.startDate)).join(", ")
  );

  // With a single child, the whole of their break should be available.
  const single = generateWindows({
    now,
    children: [
      {
        childId: "a",
        childName: "Maya",
        entries: [
          { startDate: utcDay(2027, 3, 22), endDate: utcDay(2027, 3, 26), title: "Spring Break", kind: "BREAK", noSchool: true },
        ],
      },
    ],
    adults: [{ memberId: "p1", name: "Alex", ptoDaysRemaining: 15 }],
    blackouts: [],
  });
  const solo = single[0];
  check(
    "one child alone gets the full break plus both weekends (9 days)",
    solo != null && solo.totalDays === 9,
    solo ? `${solo.totalDays} days` : "missing"
  );
  check("the window is labelled from the school's own wording",
    solo != null && solo.label.toLowerCase().includes("spring"), solo?.label);
}

// --- 5. PTO accounting ------------------------------------------------------

section("5. PTO cost counts working days only");
{
  // Memorial Day 2027 is Monday May 31.
  const memorial = federalHolidays(2027).find((h) => h.key === "memorial")!;
  check("Memorial Day 2027 computes to May 31", dayKey(memorial.date) === "2027-05-31",
    dayKey(memorial.date));

  // Sat May 29 - Sun Jun 6: weekends + the holiday are free.
  const working = workingDaysIn(utcDay(2027, 5, 29), utcDay(2027, 6, 6));
  check(
    "a 9-day window over Memorial Day costs 4 PTO days, not 9",
    working.length === 4,
    `${working.length}: ${working.map(dayKey).join(", ")}`
  );

  const windows = generateWindows({
    now: utcDay(2027, 1, 4),
    children: [
      {
        childId: "a",
        childName: "Maya",
        entries: [
          { startDate: utcDay(2027, 6, 1), endDate: utcDay(2027, 6, 4), title: "Break", kind: "BREAK", noSchool: true },
        ],
      },
    ],
    adults: [{ memberId: "p1", name: "Alex", ptoDaysRemaining: 2 }],
    blackouts: [],
  });
  const window = windows[0];
  check("PTO shortfall is flagged against the adult's balance",
    window != null && window.conflicts.some((c) => c.includes("PTO days left")),
    window?.conflicts.join(" | "));
}

// --- 6. Blackouts -----------------------------------------------------------

section("6. A blackout demotes a window rather than hiding it");
{
  const base = {
    now: utcDay(2027, 1, 4),
    children: [
      {
        childId: "a",
        childName: "Maya",
        entries: [
          { startDate: utcDay(2027, 3, 22), endDate: utcDay(2027, 3, 26), title: "Spring Break", kind: "BREAK", noSchool: true },
          { startDate: utcDay(2027, 4, 12), endDate: utcDay(2027, 4, 16), title: "April Break", kind: "BREAK", noSchool: true },
        ],
      },
    ],
    adults: [{ memberId: "p1", name: "Alex", ptoDaysRemaining: 20 }],
  };

  const clean = generateWindows({ ...base, blackouts: [] });
  const blocked = generateWindows({
    ...base,
    blackouts: [
      {
        memberId: "p1",
        memberName: "Alex",
        startDate: utcDay(2027, 3, 23),
        endDate: utcDay(2027, 3, 25),
        reason: "Quarter close",
      },
    ],
  });

  const cleanSpring = clean.find((w) => w.label.toLowerCase().includes("spring"))!;
  const blockedSpring = blocked.find((w) => w.label.toLowerCase().includes("spring"))!;

  check("the window still appears when blacked out", blockedSpring != null);
  check("its score drops sharply", blockedSpring.score < cleanSpring.score - 50,
    `${cleanSpring.score} → ${blockedSpring.score}`);
  check("the reason is stated, not just the penalty",
    blockedSpring.conflicts.some((c) => c.includes("Quarter close")),
    blockedSpring.conflicts.join(" | "));
  check("it now ranks below the unaffected window",
    blocked[0].label.toLowerCase().includes("april"),
    blocked.map((w) => w.label).join(", "));
}

// --- 7. Holidays and seasonality -------------------------------------------

section("7. Holidays are computed, seasons are labelled");
{
  const h2027 = federalHolidays(2027);
  check("Thanksgiving 2027 is Thu Nov 25",
    dayKey(h2027.find((h) => h.key === "thanksgiving")!.date) === "2027-11-25");
  check("MLK Day 2027 is Mon Jan 18",
    dayKey(h2027.find((h) => h.key === "mlk")!.date) === "2027-01-18");
  check("July 4 2027 falls on a Sunday, so it's observed Mon Jul 5",
    dayKey(h2027.find((h) => h.key === "independence")!.date) === "2027-07-05");

  const h2030 = federalHolidays(2030);
  check("the rules still work in 2030 (no expiring table)",
    dayKey(h2030.find((h) => h.key === "labor")!.date) === "2030-09-02");

  const july = assessSeason(utcDay(2027, 7, 3), utcDay(2027, 7, 10));
  const september = assessSeason(utcDay(2027, 9, 11), utcDay(2027, 9, 18));
  check("July 4th week is PEAK", july.season === "PEAK", july.season);
  check("mid-September is OFF_PEAK", september.season === "OFF_PEAK", september.season);
  check("peak weeks say why they're expensive",
    july.reasons.some((r) => r.toLowerCase().includes("independence")),
    july.reasons.join(" | "));
}

// --- 8. Determinism ---------------------------------------------------------

section("8. The engine is deterministic");
{
  const input = {
    now: utcDay(2027, 1, 4),
    children: [
      {
        childId: "a",
        childName: "Maya",
        entries: [
          { startDate: utcDay(2027, 3, 22), endDate: utcDay(2027, 3, 26), title: "Spring Break", kind: "BREAK", noSchool: true },
          { startDate: utcDay(2027, 6, 14), endDate: utcDay(2027, 8, 20), title: "Summer Break", kind: "BREAK", noSchool: true },
        ],
      },
    ],
    adults: [{ memberId: "p1", name: "Alex", ptoDaysRemaining: 15 }],
    blackouts: [],
  };

  const first = JSON.stringify(generateWindows(input));
  const second = JSON.stringify(generateWindows(input));
  check("two runs produce identical output", first === second);

  const windows = generateWindows(input);
  check("every window carries at least one reason",
    windows.every((w) => w.reasons.length > 0));
  check("windows are sorted by score, descending",
    windows.every((w, i) => i === 0 || windows[i - 1].score >= w.score));
  check("nothing is suggested inside the two-week lead time",
    windows.every((w) => w.startDate >= utcDay(2027, 1, 18)));
}

console.log(
  `\n${failed === 0 ? "[32m" : "[31m"}${passed} passed, ${failed} failed[0m\n`
);
process.exit(failed === 0 ? 0 : 1);
