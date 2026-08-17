import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import type { Household, HouseholdMember, User } from "@/generated/prisma/client";

// TravelOS access control.
//
// Two tiers, because this module holds two different kinds of data:
//
//   VIEWER  — any household member, including children. School calendars,
//             detected breaks, and confirmed trips are family information.
//             A ten-year-old should be able to see when spring break is and
//             where the family is going; hiding that would be absurd.
//
//   PLANNER — OWNER and ADULT only. Anything that touches money or an adult's
//             working life: per-trip budgets, PTO balances, blackout periods,
//             flight prices, and creating the FinancialOS savings goal.
//
// This is deliberately softer than FinancialOS, which is adults-only
// throughout. The difference is the data, not the module: a bank balance is
// not family information in the way a school holiday is.

export type TravelDenialReason =
  | "NO_SESSION"
  | "NO_HOUSEHOLD"
  | "NOT_ENTITLED"
  | "NOT_A_PLANNER";

export type TravelAccess =
  | {
      ok: true;
      user: User;
      household: Household;
      member: HouseholdMember;
      /** True when this member may see budgets, PTO and prices. */
      canPlan: boolean;
    }
  | { ok: false; reason: TravelDenialReason; household?: Household };

const PLANNER_ROLES = new Set(["OWNER", "ADULT"]);

export async function requireTravelAccess(): Promise<TravelAccess> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "NO_SESSION" };

  const household = await getCurrentHousehold();
  if (!household) return { ok: false, reason: "NO_HOUSEHOLD" };

  if (!(await isEntitled(household.id, "travel"))) {
    return { ok: false, reason: "NOT_ENTITLED", household };
  }

  const member = await db.householdMember.findFirst({
    where: { householdId: household.id, userId: user.id },
  });
  if (!member) return { ok: false, reason: "NOT_A_PLANNER", household };

  return { ok: true, user, household, member, canPlan: PLANNER_ROLES.has(member.role) };
}

/** For routes that write budgets, PTO, prices, or savings goals. */
export async function requireTravelPlanner(): Promise<TravelAccess> {
  const access = await requireTravelAccess();
  if (!access.ok) return access;
  if (!access.canPlan) {
    return { ok: false, reason: "NOT_A_PLANNER", household: access.household };
  }
  return access;
}

export function travelDenialMessage(reason: TravelDenialReason): string {
  switch (reason) {
    case "NO_SESSION":
      return "Sign in to view TravelOS.";
    case "NO_HOUSEHOLD":
      return "Set up your household first.";
    case "NOT_ENTITLED":
      return "TravelOS isn't included in your plan yet.";
    case "NOT_A_PLANNER":
      return "Only adults in this household can change travel plans.";
  }
}

export function travelDenialStatus(reason: TravelDenialReason): number {
  switch (reason) {
    case "NO_SESSION":
      return 401;
    case "NO_HOUSEHOLD":
      return 400;
    case "NOT_ENTITLED":
    case "NOT_A_PLANNER":
      return 403;
  }
}

/** Guard for API routes. Returns a ready-made response on denial. */
export async function guardTravelRoute(
  level: "VIEW" | "PLAN" = "PLAN"
): Promise<
  | { ok: true; user: User; household: Household; member: HouseholdMember; canPlan: boolean }
  | { ok: false; response: NextResponse }
> {
  const access = level === "PLAN" ? await requireTravelPlanner() : await requireTravelAccess();

  if (!access.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: travelDenialMessage(access.reason) },
        { status: travelDenialStatus(access.reason) }
      ),
    };
  }
  return {
    ok: true,
    user: access.user,
    household: access.household,
    member: access.member,
    canPlan: access.canPlan,
  };
}

/** Confirm a record belongs to this household before touching it. */
export async function assertCalendarInHousehold(householdId: string, calendarId: string) {
  return db.schoolCalendar.findFirst({ where: { id: calendarId, householdId } });
}

export async function assertWindowInHousehold(householdId: string, windowId: string) {
  return db.travelWindow.findFirst({ where: { id: windowId, householdId } });
}

export async function assertTripInHousehold(householdId: string, tripId: string) {
  return db.trip.findFirst({ where: { id: tripId, householdId } });
}
