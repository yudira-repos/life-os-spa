import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getCurrentHousehold } from "@/lib/session";
import { isEntitled } from "@/lib/entitlements";
import type { Household, HouseholdMember, User } from "@/generated/prisma/client";

// PropertyOS access control — the same two-tier shape as TravelOS.
//
//   VIEWER  (any member)   maintenance tasks, equipment, vendors. A teenager
//                          who's been asked to clean the gutters should be
//                          able to see the task and mark it done.
//   MANAGER (OWNER/ADULT)  bills, amounts, payment history, cost rollups.
//
// The split is money, again. What needs doing around the house is family
// information; what the house costs is not.

export type PropertyDenialReason =
  | "NO_SESSION"
  | "NO_HOUSEHOLD"
  | "NOT_ENTITLED"
  | "NOT_A_MANAGER";

export type PropertyAccess =
  | {
      ok: true;
      user: User;
      household: Household;
      member: HouseholdMember;
      /** True when this member may see and change bills and costs. */
      canManage: boolean;
    }
  | { ok: false; reason: PropertyDenialReason; household?: Household };

const MANAGER_ROLES = new Set(["OWNER", "ADULT"]);

export async function requirePropertyAccess(): Promise<PropertyAccess> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "NO_SESSION" };

  const household = await getCurrentHousehold();
  if (!household) return { ok: false, reason: "NO_HOUSEHOLD" };

  if (!(await isEntitled(household.id, "property"))) {
    return { ok: false, reason: "NOT_ENTITLED", household };
  }

  const member = await db.householdMember.findFirst({
    where: { householdId: household.id, userId: user.id },
  });
  if (!member) return { ok: false, reason: "NOT_A_MANAGER", household };

  return {
    ok: true,
    user,
    household,
    member,
    canManage: MANAGER_ROLES.has(member.role),
  };
}

export async function requirePropertyManager(): Promise<PropertyAccess> {
  const access = await requirePropertyAccess();
  if (!access.ok) return access;
  if (!access.canManage) {
    return { ok: false, reason: "NOT_A_MANAGER", household: access.household };
  }
  return access;
}

export function propertyDenialMessage(reason: PropertyDenialReason): string {
  switch (reason) {
    case "NO_SESSION":
      return "Sign in to view PropertyOS.";
    case "NO_HOUSEHOLD":
      return "Set up your household first.";
    case "NOT_ENTITLED":
      return "PropertyOS isn't included in your plan yet.";
    case "NOT_A_MANAGER":
      return "Only adults in this household can change bills and costs.";
  }
}

export function propertyDenialStatus(reason: PropertyDenialReason): number {
  switch (reason) {
    case "NO_SESSION":
      return 401;
    case "NO_HOUSEHOLD":
      return 400;
    case "NOT_ENTITLED":
    case "NOT_A_MANAGER":
      return 403;
  }
}

export async function guardPropertyRoute(
  level: "VIEW" | "MANAGE" = "MANAGE"
): Promise<
  | { ok: true; user: User; household: Household; member: HouseholdMember; canManage: boolean }
  | { ok: false; response: NextResponse }
> {
  const access =
    level === "MANAGE" ? await requirePropertyManager() : await requirePropertyAccess();

  if (!access.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: propertyDenialMessage(access.reason) },
        { status: propertyDenialStatus(access.reason) }
      ),
    };
  }
  return {
    ok: true,
    user: access.user,
    household: access.household,
    member: access.member,
    canManage: access.canManage,
  };
}

// Never trust an id off the wire.

export async function assertPropertyInHousehold(householdId: string, propertyId: string) {
  return db.property.findFirst({ where: { id: propertyId, householdId } });
}

export async function assertBillInHousehold(householdId: string, billId: string) {
  return db.propertyBill.findFirst({ where: { id: billId, householdId } });
}

export async function assertTaskInHousehold(householdId: string, taskId: string) {
  return db.maintenanceTask.findFirst({ where: { id: taskId, householdId } });
}

export async function assertVendorInHousehold(householdId: string, vendorId: string) {
  return db.vendor.findFirst({ where: { id: vendorId, householdId } });
}

export async function assertEquipmentInHousehold(householdId: string, equipmentId: string) {
  return db.equipment.findFirst({ where: { id: equipmentId, householdId } });
}
