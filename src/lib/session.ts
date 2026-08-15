import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// Every (shell) page calls this once. It resolves the signed-in user AND
// their household in a single place, so "no session" / "no household yet"
// redirects stay consistent everywhere instead of copy-pasted per page.
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;

  return db.user.findUnique({ where: { id: userId } });
}

export async function getCurrentHousehold() {
  const user = await getCurrentUser();
  if (!user) return null;

  // V1: one household per user, found either by ownership or membership.
  const owned = await db.household.findFirst({ where: { ownerId: user.id } });
  if (owned) return owned;

  const membership = await db.householdMember.findFirst({
    where: { userId: user.id },
    include: { household: true },
  });
  return membership?.household ?? null;
}
