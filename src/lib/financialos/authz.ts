import { db } from "@/lib/db";
import { getCurrentUser, getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import type { Household, HouseholdMember, User } from "@/generated/prisma/client";

// FinancialOS access control. DESIGN.md called this out as a precondition for
// this module being real: "HealthOS and FinancialOS need explicit, stronger
// access controls than the rest of LifeOS before they're real."
//
// The rest of LifeOS gates on one question — is this household entitled to the
// module? FinancialOS gates on four, in order:
//
//   1. Is there a signed-in user with a household?          (session)
//   2. Is the household entitled to `financial`?            (entitlements)
//   3. Is this user an OWNER or ADULT of that household?    (role)   <-- new
//   4. Is this specific record visible to this member?      (visibility) <-- new
//
// Step 3 is the important one. Bank balances, salaries, and transaction
// histories are not household-wide information the way a family calendar is.
// A CHILD member is a first-class LifeOS user with their own login and their
// own KidsOS data — and must never be able to read a single row from this
// module, even by typing the URL. GUEST likewise.
//
// Everything in this module goes through `requireFinancialAccess`. There is no
// second path in, and no route re-implements the check.

export type FinancialDenialReason =
  | "NO_SESSION"
  | "NO_HOUSEHOLD"
  | "NOT_ENTITLED"
  | "NOT_AN_ADULT";

export type FinancialAccessResult =
  | {
      ok: true;
      user: User;
      household: Household;
      member: HouseholdMember;
      isOwner: boolean;
    }
  | { ok: false; reason: FinancialDenialReason; household?: Household };

/** Roles allowed to see any financial data at all. */
const FINANCIAL_ROLES = new Set(["OWNER", "ADULT"]);

export async function requireFinancialAccess(): Promise<FinancialAccessResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "NO_SESSION" };

  const household = await getCurrentHousehold();
  if (!household) return { ok: false, reason: "NO_HOUSEHOLD" };

  if (!(await isEntitled(household.id, "financial"))) {
    return { ok: false, reason: "NOT_ENTITLED", household };
  }

  const member = await db.householdMember.findFirst({
    where: { householdId: household.id, userId: user.id },
  });

  // No member row, or a CHILD/GUEST row, means no financial data. Note we do
  // NOT fall back to "they own the household, so let them in" — ownership is
  // already represented as an OWNER member row (see the onboarding route), and
  // a silent fallback is exactly the kind of second path in that turns into a
  // hole later.
  if (!member || !FINANCIAL_ROLES.has(member.role)) {
    return { ok: false, reason: "NOT_AN_ADULT", household };
  }

  return {
    ok: true,
    user,
    household,
    member,
    isOwner: member.role === "OWNER",
  };
}

export function denialMessage(reason: FinancialDenialReason): string {
  switch (reason) {
    case "NO_SESSION":
      return "Sign in to view FinancialOS.";
    case "NO_HOUSEHOLD":
      return "Set up your household first.";
    case "NOT_ENTITLED":
      return "FinancialOS isn't included in your plan yet.";
    case "NOT_AN_ADULT":
      return "FinancialOS is limited to adults in this household.";
  }
}

export function denialStatus(reason: FinancialDenialReason): number {
  switch (reason) {
    case "NO_SESSION":
      return 401;
    case "NO_HOUSEHOLD":
      return 400;
    case "NOT_ENTITLED":
    case "NOT_AN_ADULT":
      return 403;
  }
}

// --- Record-level visibility -----------------------------------------------
// An account can be marked OWNER_ONLY — e.g. one spouse's inherited account,
// or an account belonging to an adult child living at home. Household-visible
// is the default because shared planning is the point of the module; the flag
// exists so that "I want to use this app" doesn't force full disclosure of
// every account to every adult in the house.

export interface VisibilityScope {
  memberId: string;
  isOwner: boolean;
}

/**
 * Prisma `where` fragment restricting accounts to what this member may see.
 * Applied to every account and transaction query in the module.
 */
export function accountVisibilityWhere(scope: VisibilityScope) {
  return {
    OR: [
      { visibility: "HOUSEHOLD" },
      { ownerMemberId: scope.memberId },
      // An OWNER_ONLY account with no owner set would otherwise be invisible
      // to everyone including the person who created it — treat an unowned
      // private account as household-visible rather than orphaning the data.
      { visibility: "OWNER_ONLY", ownerMemberId: null },
    ],
  };
}

/** Same rule, for filtering an already-loaded list. */
export function canSeeAccount(
  account: { visibility: string; ownerMemberId: string | null },
  scope: VisibilityScope
): boolean {
  if (account.visibility === "HOUSEHOLD") return true;
  if (!account.ownerMemberId) return true;
  return account.ownerMemberId === scope.memberId;
}

/**
 * Confirm a record the client named actually belongs to the caller's household
 * before anything touches it. The FinancialOS analogue of KidsOS's
 * `getChildInHousehold` — never trust an id off the wire.
 */
export async function assertAccountInHousehold(
  householdId: string,
  accountId: string,
  scope: VisibilityScope
) {
  const account = await db.financialAccount.findFirst({
    where: { id: accountId, householdId, ...accountVisibilityWhere(scope) },
  });
  return account;
}

export async function assertGoalInHousehold(householdId: string, goalId: string) {
  return db.savingsGoal.findFirst({ where: { id: goalId, householdId } });
}

export async function assertItemInHousehold(householdId: string, itemId: string) {
  return db.plaidItem.findFirst({ where: { id: itemId, householdId } });
}

/** Adults in the household — the set of people the advice engine plans for. */
export async function getHouseholdAdults(householdId: string) {
  return db.householdMember.findMany({
    where: { householdId, role: { in: ["OWNER", "ADULT"] } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getHouseholdChildren(householdId: string) {
  return db.householdMember.findMany({
    where: { householdId, role: "CHILD" },
    orderBy: { birthdate: "asc" },
  });
}
