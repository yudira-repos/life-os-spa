/**
 * Seed a realistic DayOS household so the module can be exercised before the
 * activity-entry UI exists.
 *
 *   npx tsx scripts/seed-dayos-demo.ts
 *   npx tsx scripts/seed-dayos-demo.ts --household <id>
 *   npx tsx scripts/seed-dayos-demo.ts --reset      # remove the demo rows again
 *
 * Attaches to an existing household (the first one, or `--household`). It does
 * not create users or touch auth — sign in normally first, then run this.
 *
 * The fixture is the PRD's own example family, because the interesting cases
 * are all in it:
 *
 *   - a rotation with two household adults AND two external carpool parents,
 *     which is the case a members-only model can't express
 *   - Ravi's Mon/Fri pickup landing 15 minutes after a meeting ends 25 minutes
 *     away, which is the clash no calendar can see
 *   - a dance class that asks for confirmation, so the escalation ladder has
 *     something to climb
 *   - a Saturday activity, so the Today page isn't empty at the weekend
 *
 * Every member gets an IN_APP channel and nothing else, on purpose: the tick
 * will then write dispatch rows you can read without sending a real message to
 * a real phone. Add a Telegram channel by hand when you want to test delivery.
 *
 * Idempotent — re-running updates the same rows rather than duplicating them.
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnv, requireDatabaseUrl } from "./_env";

loadEnv();
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }),
});

// The fixture's own names. Kept in one place because they are both the
// idempotency key (re-running updates rather than duplicates) and the reset
// key. Nothing is prefixed with a tag: these labels appear inside the messages,
// and "[demo] Mission Hills School" reads like a bug rather than a fixture.
const DEMO_PLACES = ["Home", "Work", "Mission Hills School", "Dance Studio", "Soccer Field"];
const DEMO_ACTIVITIES = [
  "School drop-off",
  "School pickup",
  "Design review",
  "Dance class",
  "Soccer practice",
];
const DEMO_CONTACTS = ["Priya (carpool)", "Marcus (carpool)"];
const DEMO_GROUP = "Mission Hills Carpool";
const DEMO_ROTATION = "School pickup rota";

/** Minutes since local midnight. */
const at = (hour: number, minute = 0) => hour * 60 + minute;

/** UTC midnight for a calendar day, matching the storage convention. */
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const argOf = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
};

async function resolveHousehold(): Promise<{ id: string; name: string }> {
  const requested = argOf("--household");
  if (requested) {
    const found = await db.household.findUnique({
      where: { id: requested },
      select: { id: true, name: true },
    });
    if (!found) throw new Error(`No household with id ${requested}`);
    return found;
  }

  const households = await db.household.findMany({ select: { id: true, name: true } });
  if (households.length === 0) {
    throw new Error(
      "No households exist yet. Sign in to the app and finish onboarding first, then re-run."
    );
  }
  if (households.length > 1) {
    console.log("More than one household — using the first. Pass --household <id> to pick:");
    for (const h of households) console.log(`  ${h.id}  ${h.name}`);
  }
  return households[0];
}

async function reset(householdId: string) {
  // Matched by exact name. The trade for readable messages is that a place you
  // created by hand and happened to call "Home" is in scope for --reset — so it
  // says which names it is about to remove rather than doing it silently.
  console.log(`Removing by name: ${[...DEMO_ACTIVITIES, ...DEMO_PLACES].join(", ")}`);

  const activities = await db.activity.findMany({
    where: { householdId, name: { in: DEMO_ACTIVITIES } },
    select: { id: true },
  });
  await db.activity.deleteMany({ where: { id: { in: activities.map((a) => a.id) } } });
  await db.rotation.deleteMany({ where: { householdId, name: DEMO_ROTATION } });
  await db.coordinationGroup.deleteMany({ where: { householdId, name: DEMO_GROUP } });
  await db.externalContact.deleteMany({ where: { householdId, name: { in: DEMO_CONTACTS } } });
  await db.place.deleteMany({ where: { householdId, label: { in: DEMO_PLACES } } });
  console.log("Done. Members, channels and preferences are untouched.");
}

async function main() {
  const household = await resolveHousehold();
  console.log(`Household: ${household.name} (${household.id})\n`);

  if (process.argv.includes("--reset")) {
    await reset(household.id);
    return;
  }

  // --- Preferences ---------------------------------------------------------
  // Proactive messaging stays OFF. Nothing is ever sent because a seed ran.
  await db.dayPreferences.upsert({
    where: { householdId: household.id },
    create: { householdId: household.id, timeZone: "America/Los_Angeles" },
    update: {},
  });

  // --- Entitlement ---------------------------------------------------------
  await db.entitlement.upsert({
    where: { householdId_moduleId: { householdId: household.id, moduleId: "day" } },
    create: { householdId: household.id, moduleId: "day", enabled: true },
    update: { enabled: true },
  });

  // --- Places --------------------------------------------------------------
  // Places and activities are named naturally, not tagged: their labels show up
  // inside the messages, and "[demo] Mission Hills School — leave 2:37" reads
  // like a bug rather than a fixture. Reset matches them by these exact names.
  const place = async (
    label: string,
    kind: string,
    address: string,
    parkingBufferMinutes = 0
  ) => {
    const name = label;
    const existing = await db.place.findFirst({
      where: { householdId: household.id, label: name },
    });
    if (existing) {
      return db.place.update({
        where: { id: existing.id },
        data: { kind, address, parkingBufferMinutes },
      });
    }
    return db.place.create({
      data: { householdId: household.id, label: name, kind, address, parkingBufferMinutes },
    });
  };

  const home = await place("Home", "HOME", "1600 Amphitheatre Pkwy, Mountain View, CA");
  const work = await place("Work", "WORK", "1 Hacker Way, Menlo Park, CA");
  // The pickup line is real time, and it is the reason a 3:15 pickup needs you
  // there at 3:05 rather than 3:14.
  const school = await place("Mission Hills School", "SCHOOL", "500 Castro St, Mountain View, CA", 8);
  const dance = await place("Dance Studio", "ACTIVITY", "2500 El Camino Real, Palo Alto, CA");
  const field = await place("Soccer Field", "ACTIVITY", "1000 N Rengstorff Ave, Mountain View, CA");

  // --- Members -------------------------------------------------------------
  // Uses whoever is already in the household; only tops it up if it's empty.
  let members = await db.householdMember.findMany({
    where: { householdId: household.id },
    orderBy: { createdAt: "asc" },
  });

  const ensureMember = async (name: string, role: "OWNER" | "ADULT" | "CHILD") => {
    const found = members.find((m) => m.role === role && m.name.startsWith(name));
    if (found) return found;
    const created = await db.householdMember.create({
      data: { householdId: household.id, name, role },
    });
    members = [...members, created];
    return created;
  };

  const adults = members.filter((m) => m.role === "OWNER" || m.role === "ADULT");
  const primary = adults[0] ?? (await ensureMember("Ravi", "OWNER"));
  const secondary = adults[1] ?? (await ensureMember("Divya", "ADULT"));
  const child =
    members.find((m) => m.role === "CHILD") ?? (await ensureMember("Ayuktha", "CHILD"));

  // --- Channels and day profiles ------------------------------------------
  for (const adult of [primary, secondary]) {
    await db.memberChannel.upsert({
      where: { memberId_channel: { memberId: adult.id, channel: "IN_APP" } },
      create: { memberId: adult.id, channel: "IN_APP", address: adult.id, isPrimary: true, verified: true },
      update: { isPrimary: true },
    });
    await db.memberDayProfile.upsert({
      where: { memberId: adult.id },
      create: {
        memberId: adult.id,
        homePlaceId: home.id,
        workPlaceId: work.id,
        workWeekdays: "1,2,3,4,5",
        workStartMinute: at(9),
        workEndMinute: at(17),
      },
      update: { homePlaceId: home.id, workPlaceId: work.id },
    });
  }

  // --- External carpool parents -------------------------------------------
  const contact = async (name: string) => {
    const existing = await db.externalContact.findFirst({
      where: { householdId: household.id, name },
    });
    if (existing) return existing;
    return db.externalContact.create({
      data: {
        householdId: household.id,
        name,
        relationship: "CARPOOL_PARENT",
        // NONE, deliberately: these two have no reachable channel, which is what
        // the "can't be reached" warning on the Today page exists to surface.
        channel: "NONE",
      },
    });
  };
  const parentA = await contact("Priya (carpool)");
  const parentB = await contact("Marcus (carpool)");

  // --- Carpool group and rotation -----------------------------------------
  const groupName = DEMO_GROUP;
  let group = await db.coordinationGroup.findFirst({
    where: { householdId: household.id, name: groupName },
  });
  if (!group) {
    group = await db.coordinationGroup.create({
      data: { householdId: household.id, name: groupName, kind: "CARPOOL" },
    });
  }
  await db.coordinationGroupMember.deleteMany({ where: { groupId: group.id } });
  await db.coordinationGroupMember.createMany({
    data: [
      { groupId: group.id, memberId: primary.id, orderIndex: 0 },
      { groupId: group.id, contactId: parentA.id, orderIndex: 1 },
      { groupId: group.id, memberId: secondary.id, orderIndex: 2 },
      { groupId: group.id, contactId: parentB.id, orderIndex: 3 },
    ],
  });

  const rotationName = DEMO_ROTATION;
  let rotation = await db.rotation.findFirst({
    where: { householdId: household.id, name: rotationName },
  });
  if (!rotation) {
    rotation = await db.rotation.create({
      data: {
        householdId: household.id,
        groupId: group.id,
        name: rotationName,
        kind: "FIXED_WEEKDAY",
        anchorDay: day(2026, 8, 24),
      },
    });
  }
  await db.rotationSlot.deleteMany({ where: { rotationId: rotation.id } });
  await db.rotationSlot.createMany({
    data: [
      // The PRD's own rota: Mon Ravi, Tue Parent A, Wed Divya, Thu Parent B, Fri Ravi.
      { rotationId: rotation.id, weekday: 1, orderIndex: 0, memberId: primary.id },
      { rotationId: rotation.id, weekday: 2, orderIndex: 1, contactId: parentA.id },
      { rotationId: rotation.id, weekday: 3, orderIndex: 2, memberId: secondary.id },
      { rotationId: rotation.id, weekday: 4, orderIndex: 3, contactId: parentB.id },
      { rotationId: rotation.id, weekday: 5, orderIndex: 4, memberId: primary.id },
    ],
  });

  // --- Activities ----------------------------------------------------------
  const activity = async (data: {
    name: string;
    category: string;
    subjectMemberId?: string | null;
    placeId?: string | null;
    startMinute: number;
    durationMinutes?: number | null;
    weekdays: string;
    travelRequired?: boolean;
    arrivalBufferMinutes?: number | null;
    defaultResponsibleMemberId?: string | null;
    rotationId?: string | null;
    requiresConfirmation?: boolean;
    notifyGroup?: boolean;
  }) => {
    const name = data.name;
    const payload = {
      householdId: household.id,
      name,
      category: data.category,
      subjectMemberId: data.subjectMemberId ?? null,
      placeId: data.placeId ?? null,
      startMinute: data.startMinute,
      durationMinutes: data.durationMinutes ?? null,
      weekdays: data.weekdays,
      effectiveFrom: day(2026, 8, 1),
      effectiveTo: day(2027, 6, 30),
      schoolDaysOnly: data.category === "SCHOOL",
      travelRequired: data.travelRequired ?? true,
      arrivalBufferMinutes: data.arrivalBufferMinutes ?? null,
      defaultResponsibleMemberId: data.defaultResponsibleMemberId ?? null,
      rotationId: data.rotationId ?? null,
      requiresConfirmation: data.requiresConfirmation ?? false,
      notifyGroup: data.notifyGroup ?? false,
      status: "ACTIVE",
    };
    const existing = await db.activity.findFirst({
      where: { householdId: household.id, name },
    });
    if (existing) {
      return db.activity.update({ where: { id: existing.id }, data: payload });
    }
    return db.activity.create({ data: payload });
  };

  await activity({
    name: "School drop-off",
    category: "SCHOOL",
    subjectMemberId: child.id,
    placeId: school.id,
    startMinute: at(8, 0),
    durationMinutes: 15,
    weekdays: "1,2,3,4,5",
    defaultResponsibleMemberId: primary.id,
  });

  await activity({
    name: "School pickup",
    category: "SCHOOL",
    subjectMemberId: child.id,
    placeId: school.id,
    startMinute: at(15, 15),
    durationMinutes: 20,
    weekdays: "1,2,3,4,5",
    rotationId: rotation.id,
    requiresConfirmation: true,
    notifyGroup: true,
  });

  // The clash generator. Ravi has pickup on Monday and Friday; this meeting ends
  // at 3:00 at the office, 15 minutes before a pickup that's a 25-minute drive
  // away. Nothing overlaps on a calendar. He cannot do both.
  await activity({
    name: "Design review",
    category: "COMMUTE",
    placeId: work.id,
    startMinute: at(14, 0),
    durationMinutes: 60,
    weekdays: "1,2,3,4,5",
    travelRequired: false,
    defaultResponsibleMemberId: primary.id,
  });

  await activity({
    name: "Dance class",
    category: "CLASS",
    subjectMemberId: child.id,
    placeId: dance.id,
    startMinute: at(17, 0),
    durationMinutes: 60,
    weekdays: "2,4",
    defaultResponsibleMemberId: secondary.id,
    requiresConfirmation: true,
  });

  await activity({
    name: "Soccer practice",
    category: "SPORT",
    subjectMemberId: child.id,
    placeId: field.id,
    startMinute: at(9, 0),
    durationMinutes: 90,
    weekdays: "6",
    defaultResponsibleMemberId: secondary.id,
  });

  console.log("Seeded:");
  console.log(`  places      5  (Home, Work, School, Dance Studio, Soccer Field)`);
  console.log(`  members     ${primary.name}, ${secondary.name}, ${child.name}`);
  console.log(`  contacts    2 carpool parents, deliberately with no reachable channel`);
  console.log(`  rotation    Mon ${primary.name} · Tue Priya · Wed ${secondary.name} · Thu Marcus · Fri ${primary.name}`);
  console.log(`  activities  5 (drop-off, pickup, design review, dance, soccer)`);
  console.log("");
  console.log("Proactive messaging is still OFF, and the only channel is IN_APP.");
  console.log("Next:  npx tsx scripts/dayos-simulate.ts --date 2026-08-24");
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
