import "dotenv/config";
import { db } from "@/lib/db";
import { materializeDay } from "@/lib/dayos/service";

async function main() {
  const household = await db.household.findFirst();
  if (!household) {
    console.error("No households found");
    process.exit(1);
  }
  
  const today = new Date();
  await materializeDay(household.id, today);
  console.log(`Materialized ${today.toDateString()} for household ${household.id}`);
}

main().catch(console.error);
