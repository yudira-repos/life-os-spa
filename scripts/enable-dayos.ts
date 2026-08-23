/**
 * Turn DayOS on for households that already exist.
 *
 *   npx tsx scripts/enable-dayos.ts
 *
 * `FREE_MODULES` seeds entitlements at household CREATION, so adding "day" to
 * that list only helps households created from now on. Existing ones see a
 * locked module until they have an Entitlement row — which is exactly the kind
 * of thing that gets debugged for an hour before someone remembers.
 *
 * Also creates the DayPreferences row each household needs, with proactive
 * messaging OFF. Nobody gets messaged because a migration ran.
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnv, requireDatabaseUrl } from "./_env";

loadEnv();
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }),
});

async function main() {
  const households = await db.household.findMany({ select: { id: true, name: true } });
  let entitled = 0;
  let prefsCreated = 0;

  for (const household of households) {
    const existing = await db.entitlement.findUnique({
      where: { householdId_moduleId: { householdId: household.id, moduleId: "day" } },
    });
    if (!existing) {
      await db.entitlement.create({
        data: { householdId: household.id, moduleId: "day", enabled: true },
      });
      entitled += 1;
    } else if (!existing.enabled) {
      await db.entitlement.update({ where: { id: existing.id }, data: { enabled: true } });
      entitled += 1;
    }

    const prefs = await db.dayPreferences.findUnique({
      where: { householdId: household.id },
    });
    if (!prefs) {
      await db.dayPreferences.create({ data: { householdId: household.id } });
      prefsCreated += 1;
    }
  }

  console.log(
    `DayOS enabled for ${entitled} household(s); ${prefsCreated} preference row(s) created.`
  );
  console.log(
    "Proactive messaging is OFF for all of them — turn it on per household when you're ready."
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
