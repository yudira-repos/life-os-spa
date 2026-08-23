import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import type { Household, HouseholdMember, User } from "@/generated/prisma/client";

// DayOS access control.
//
// Two tiers, the same shape as TravelOS and PropertyOS — but the line is drawn
// somewhere different, and it's worth saying why.
//
//   VIEWER      — any household member, children included. The day's schedule
//                 is the most legitimately shared information in the whole
//                 platform. A twelve-year-old should be able to open the app
//                 and see that Mum is doing pickup and the car leaves at 2:58.
//                 Hiding it produces exactly the phone call the module exists
//                 to prevent.
//
//   COORDINATOR — OWNER and ADULT. Required to change who is responsible for
//                 what, edit a rotation, or send anything to a person outside
//                 the household. The split is not money this time (there is
//                 none here); it is the ability to commit another adult's time
//                 and to message people who never signed up for LifeOS.
//
// The second half of that is the one to be careful about. A child reassigning
// the school run is a family problem. A child triggering a WhatsApp broadcast
// to four other parents is someone else's problem, and it is ours to prevent.

export type DayDenialReason =
  | "NO_SESSION"
  | "NO_HOUSEHOLD"
  | "NOT_ENTITLED"
  | "NOT_A_MEMBER"
  | "NOT_A_COORDINATOR";

export type DayAccess =
  | {
      ok: true;
      user: User;
      household: Household;
      member: HouseholdMember;
      /** True when this member may reassign responsibilities and message out. */
      canCoordinate: boolean;
    }
  | { ok: false; reason: DayDenialReason; household?: Household };

const COORDINATOR_ROLES = new Set(["OWNER", "ADULT"]);

export async function requireDayAccess(): Promise<DayAccess> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "NO_SESSION" };

  const household = await getCurrentHousehold();
  if (!household) return { ok: false, reason: "NO_HOUSEHOLD" };

  if (!(await isEntitled(household.id, "day"))) {
    return { ok: false, reason: "NOT_ENTITLED", household };
  }

  const member = await db.householdMember.findFirst({
    where: { householdId: household.id, userId: user.id },
  });
  if (!member) return { ok: false, reason: "NOT_A_MEMBER", household };

  return {
    ok: true,
    user,
    household,
    member,
    canCoordinate: COORDINATOR_ROLES.has(member.role),
  };
}

export async function requireDayCoordinator(): Promise<DayAccess> {
  const access = await requireDayAccess();
  if (!access.ok) return access;
  if (!access.canCoordinate) {
    return { ok: false, reason: "NOT_A_COORDINATOR", household: access.household };
  }
  return access;
}

export function dayDenialMessage(reason: DayDenialReason): string {
  switch (reason) {
    case "NO_SESSION":
      return "Sign in to see today's plan.";
    case "NO_HOUSEHOLD":
      return "Set up your household first.";
    case "NOT_ENTITLED":
      return "DayOS isn't included in your plan yet.";
    case "NOT_A_MEMBER":
      return "You're not a member of this household.";
    case "NOT_A_COORDINATOR":
      return "Only adults in this household can change who's responsible or message the group.";
  }
}

export function dayDenialStatus(reason: DayDenialReason): number {
  switch (reason) {
    case "NO_SESSION":
      return 401;
    case "NO_HOUSEHOLD":
      return 400;
    case "NOT_ENTITLED":
    case "NOT_A_MEMBER":
    case "NOT_A_COORDINATOR":
      return 403;
  }
}

export async function guardDayRoute(
  level: "VIEW" | "COORDINATE" = "COORDINATE"
): Promise<
  | { ok: true; user: User; household: Household; member: HouseholdMember; canCoordinate: boolean }
  | { ok: false; response: NextResponse }
> {
  const access =
    level === "COORDINATE" ? await requireDayCoordinator() : await requireDayAccess();

  if (!access.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: dayDenialMessage(access.reason) },
        { status: dayDenialStatus(access.reason) }
      ),
    };
  }
  return {
    ok: true,
    user: access.user,
    household: access.household,
    member: access.member,
    canCoordinate: access.canCoordinate,
  };
}

/**
 * The exception to the coordinator rule: the person a responsibility is
 * assigned to can always confirm or decline it, whatever their role. A teenager
 * who has been asked to walk their sibling home must be able to say no — and
 * "decline" is the answer we most need people to feel free to give, because the
 * alternative is a silent no.
 */
export function canRespondToOccurrence(
  member: HouseholdMember,
  occurrenceResponsibleMemberId: string | null,
  canCoordinate: boolean
): boolean {
  return canCoordinate || occurrenceResponsibleMemberId === member.id;
}

export async function assertOccurrenceInHousehold(householdId: string, occurrenceId: string) {
  return db.activityOccurrence.findFirst({ where: { id: occurrenceId, householdId } });
}

export async function assertActivityInHousehold(householdId: string, activityId: string) {
  return db.activity.findFirst({ where: { id: activityId, householdId } });
}
