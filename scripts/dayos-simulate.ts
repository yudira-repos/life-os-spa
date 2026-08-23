/**
 * Replay a day through the proactive loop and print every message it would send.
 *
 *   npx tsx scripts/dayos-simulate.ts
 *   npx tsx scripts/dayos-simulate.ts --date 2026-08-24
 *   npx tsx scripts/dayos-simulate.ts --date 2026-08-24 --traffic-spike 14:40
 *   npx tsx scripts/dayos-simulate.ts --from 06:00 --to 20:00 --step 5
 *
 * The tick takes `now` as a parameter — deliberately, so it can be driven by a
 * clock other than the wall one. This script walks a simulated day in 5-minute
 * steps, calling it at each, and prints the dispatch rows that appear. A full
 * day of the agent's behaviour in about ten seconds, instead of a day.
 *
 * SAFETY. This writes to the real database and, if members have real channels,
 * would send real messages. Two guards:
 *
 *   1. It refuses to run if any recipient has a channel other than IN_APP,
 *      unless you pass --allow-real-sends. The seed script gives everyone
 *      IN_APP for exactly this reason.
 *   2. It flips `proactiveEnabled` on for the run and restores whatever it was
 *      afterwards, including on Ctrl-C.
 *
 * It clears the day's dispatch rows first, so a re-run shows the whole stream
 * again rather than being deduplicated into silence. Pass --keep-dispatches to
 * test the deduplication itself.
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnv, requireDatabaseUrl } from "./_env";

loadEnv();
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }),
});

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const amber = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

const KIND_COLOR: Record<string, (s: string) => string> = {
  BRIEF: cyan,
  PREPARE: amber,
  DRIVE_NOW: green,
  RETIME: amber,
  ASK: dim,
  REMIND: dim,
  ESCALATE: amber,
  BROADCAST: red,
  UNCOVERED: red,
};

const argOf = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
};
const has = (flag: string) => process.argv.includes(flag);

const parseClock = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  return h * 60 + m;
};

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

async function main() {
  const { tickHousehold } = await import("../src/lib/dayos/agent");
  const { zonedTimeToUtc } = await import("../src/lib/dayos/time");
  const { materializeDay } = await import("../src/lib/dayos/service");

  const householdId = argOf("--household");
  const household = householdId
    ? await db.household.findUnique({ where: { id: householdId } })
    : await db.household.findFirst();

  if (!household) {
    throw new Error("No household found. Run scripts/seed-dayos-demo.ts first.");
  }

  const prefs = await db.dayPreferences.findUnique({
    where: { householdId: household.id },
  });
  if (!prefs) {
    throw new Error(
      "This household has no DayOS preferences yet. Run scripts/enable-dayos.ts."
    );
  }

  // --- Guard: don't message real people by accident ------------------------
  const externalChannels = await db.memberChannel.findMany({
    where: { member: { householdId: household.id }, channel: { not: "IN_APP" } },
    include: { member: { select: { name: true } } },
  });
  const reachableContacts = await db.externalContact.findMany({
    where: { householdId: household.id, channel: { not: "NONE" } },
  });

  if ((externalChannels.length > 0 || reachableContacts.length > 0) && !has("--allow-real-sends")) {
    console.error(red("\nRefusing to run: this household has channels that send for real.\n"));
    for (const c of externalChannels) {
      console.error(`  ${c.member.name} — ${c.channel}`);
    }
    for (const c of reachableContacts) {
      console.error(`  ${c.name} — ${c.channel}`);
    }
    console.error(
      "\nSimulating would deliver actual messages to these people. Either switch them to\n" +
        "IN_APP for testing, or pass --allow-real-sends if that is genuinely what you want.\n"
    );
    process.exit(1);
  }

  // --- The day to replay ---------------------------------------------------
  const dateArg = argOf("--date");
  const [y, m, d] = dateArg
    ? dateArg.split("-").map(Number)
    : (() => {
        const now = new Date();
        return [now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()];
      })();
  const targetDay = new Date(Date.UTC(y, m - 1, d));

  const from = parseClock(argOf("--from"), 6 * 60);
  const to = parseClock(argOf("--to"), 20 * 60);
  const step = Number(argOf("--step") ?? 5);
  const spikeAt = argOf("--traffic-spike") ? parseClock(argOf("--traffic-spike"), -1) : -1;

  const weekday = targetDay.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  console.log(
    bold(`\nSimulating ${weekday} ${targetDay.toISOString().slice(0, 10)}`) +
      dim(`  ${clock(from)}–${clock(to)}, every ${step} min, ${prefs.timeZone}\n`)
  );

  await materializeDay(household.id, targetDay);

  const occurrences = await db.activityOccurrence.findMany({
    where: { householdId: household.id, day: targetDay },
    orderBy: { startAt: "asc" },
    include: {
      activity: { select: { name: true } },
      responsibleMember: { select: { name: true } },
      responsibleContact: { select: { name: true } },
    },
  });

  if (occurrences.length === 0) {
    console.log(dim("  Nothing scheduled that day. Try a weekday, or check the seed ran.\n"));
    return;
  }

  console.log(dim("  On the schedule:"));
  for (const occ of occurrences) {
    const who =
      occ.responsibleMember?.name ?? occ.responsibleContact?.name ?? red("nobody assigned");
    console.log(dim(`    ${occ.activity.name} — ${who}`));
  }
  console.log("");

  // Start from a clean day, or the send-once guarantee correctly suppresses
  // everything on a second run and the output looks broken. Deleting the
  // occurrences and re-materializing is the honest reset: it clears the
  // dispatch log (cascade), the escalation rungs, and any confirmation, rather
  // than half-resetting three columns and hoping.
  if (!has("--keep-dispatches")) {
    const cleared = await db.activityOccurrence.deleteMany({
      where: { id: { in: occurrences.map((o) => o.id) } },
    });
    // Cached routing estimates go too. They outlive a run — a --traffic-spike
    // from the last simulation would otherwise still be in force at 06:00 of
    // the next one, and the day would start in the traffic it was supposed to
    // end in.
    const staleRoutes = await db.travelEstimate.deleteMany({
      where: { householdId: household.id },
    });
    await materializeDay(household.id, targetDay);
    if (cleared.count > 0) {
      console.log(
        dim(
          `  Reset ${cleared.count} occurrence(s) and ${staleRoutes.count} cached route(s).\n`
        )
      );
    }
  }

  // --- Restore preferences however we exit ---------------------------------
  const originalProactive = prefs.proactiveEnabled;
  const restore = async () => {
    await db.dayPreferences.update({
      where: { householdId: household.id },
      data: { proactiveEnabled: originalProactive },
    });
  };
  process.on("SIGINT", async () => {
    await restore();
    console.log(dim("\n  Interrupted — proactive setting restored.\n"));
    process.exit(130);
  });

  await db.dayPreferences.update({
    where: { householdId: household.id },
    data: { proactiveEnabled: true },
  });

  // Re-read after the reset — the ids changed.
  const live = await db.activityOccurrence.findMany({
    where: { householdId: household.id, day: targetDay },
    select: { id: true },
  });
  const occurrenceIds = live.map((o) => o.id);

  const seen = new Set<string>();
  let spiked = false;
  let messages = 0;

  try {
    for (let minute = from; minute <= to; minute += step) {
      const simulatedNow = zonedTimeToUtc(targetDay, minute, prefs.timeZone);

      // Optional traffic event, so the re-timing path has something to react to.
      //
      // Two steps, and both are needed. The env override changes what the mock
      // router answers; clearing the cache is what makes it ask. Bumping the
      // cached rows alone doesn't work, because a slower drive means an earlier
      // departure, which lands in a different 15-minute bucket that was never
      // bumped — the cache key moves with the answer.
      if (spikeAt >= 0 && !spiked && minute >= spikeAt) {
        const factor = Number(argOf("--spike-factor") ?? 2);
        process.env.DAYOS_MOCK_TRAVEL_MINUTES = String(Math.round(20 * factor));
        const cleared = await db.travelEstimate.deleteMany({
          where: { householdId: household.id },
        });
        console.log(
          amber(
            `  ${clock(minute)}  ~~ traffic rises to ${process.env.DAYOS_MOCK_TRAVEL_MINUTES} min ` +
              `(${cleared.count} cached route(s) invalidated) ~~`
          )
        );
        spiked = true;
      }

      await tickHousehold(household.id, simulatedNow);

      const dispatches = await db.notificationDispatch.findMany({
        where: { occurrenceId: { in: occurrenceIds } },
        orderBy: { createdAt: "asc" },
        include: {
          occurrence: { include: { activity: { select: { name: true } } } },
        },
      });

      for (const dispatch of dispatches) {
        if (seen.has(dispatch.id)) continue;
        seen.add(dispatch.id);
        messages += 1;

        const paint = KIND_COLOR[dispatch.kind] ?? ((s: string) => s);
        const status =
          dispatch.status === "SENT"
            ? green("sent")
            : dispatch.status === "SUPPRESSED"
              ? dim("suppressed")
              : red(dispatch.status.toLowerCase());

        console.log(
          `  ${bold(clock(minute))}  ${paint(dispatch.kind.padEnd(10))} ${dim(
            `→ ${dispatch.recipient.split(":")[0]} · ${dispatch.channel} · ${status}`
          )}`
        );
        for (const line of (dispatch.body ?? "").split("\n")) {
          console.log(`            ${line}`);
        }
        if (dispatch.detail) console.log(dim(`            (${dispatch.detail})`));
        console.log("");
      }
    }
  } finally {
    await restore();
    delete process.env.DAYOS_MOCK_TRAVEL_MINUTES;
  }

  // --- Final state ---------------------------------------------------------
  const final = await db.activityOccurrence.findMany({
    where: { householdId: household.id, day: targetDay },
    orderBy: { startAt: "asc" },
    include: { activity: { select: { name: true } } },
  });

  console.log(bold(`  ${messages} message(s) over the day.\n`));
  console.log(dim("  Where each occurrence ended up:"));
  for (const occ of final) {
    const leave = occ.leaveAt
      ? occ.leaveAt.toLocaleTimeString("en-US", {
          timeZone: prefs.timeZone,
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";
    console.log(
      dim(
        `    ${occ.activity.name.padEnd(28)} leave ${leave.padStart(8)}  ` +
          `${String(occ.travelMinutes ?? "—").padStart(3)} min  ` +
          `${occ.phase.padEnd(12)} ${occ.confirmationState}`
      )
    );
  }
  console.log("");
  console.log(
    dim(
      "  Proactive messaging is back to " +
        (originalProactive ? "on" : "off") +
        ". Nothing was sent outside the app.\n"
    )
  );
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
