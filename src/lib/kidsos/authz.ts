import { db } from "@/lib/db";

// Every KidsOS API route takes a childId from the client — this confirms
// that child actually belongs to the caller's household before touching
// any data. Never trust a childId on its own.
export async function getChildInHousehold(householdId: string, childId: string) {
  const child = await db.householdMember.findFirst({
    where: { id: childId, householdId, role: "CHILD" },
  });
  return child;
}
