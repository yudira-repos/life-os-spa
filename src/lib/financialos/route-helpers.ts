import { NextResponse } from "next/server";
import {
  requireFinancialAccess,
  denialMessage,
  denialStatus,
  type VisibilityScope,
} from "@/lib/financialos/authz";
import { auditFinancial, type FinancialAction } from "@/lib/financialos/audit";
import type { Household, HouseholdMember, User } from "@/generated/prisma/client";

// One guard every FinancialOS route calls as its first line. It guarantees:
//
//   1. the adults-only access check runs BEFORE any data is touched
//   2. a denial is audited, not just returned
//   3. the caller gets a typed context, or a ready-made error response
//
// Routes return `guard.response` immediately when `guard.ok` is false. The
// pattern is uniform across every handler in the module, so a missing check
// is visible in review at a glance.

export interface FinancialRouteContext {
  user: User;
  household: Household;
  member: HouseholdMember;
  isOwner: boolean;
  scope: VisibilityScope;
}

export type GuardResult =
  | { ok: true; context: FinancialRouteContext }
  | { ok: false; response: NextResponse };

export async function guardFinancialRoute(
  attempted: FinancialAction
): Promise<GuardResult> {
  const access = await requireFinancialAccess();

  if (!access.ok) {
    if (access.household) {
      await auditFinancial({
        householdId: access.household.id,
        action: "ACCESS_DENIED",
        resource: "MODULE",
        outcome: "DENIED",
        meta: { attempted, reason: access.reason },
      });
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: denialMessage(access.reason) },
        { status: denialStatus(access.reason) }
      ),
    };
  }

  return {
    ok: true,
    context: {
      user: access.user,
      household: access.household,
      member: access.member,
      isOwner: access.isOwner,
      scope: { memberId: access.member.id, isOwner: access.isOwner },
    },
  };
}

export class BadRequestError extends Error {
  status = 400;
}

/** Throw-on-invalid helpers, so handlers stay short and validation stays real. */
export function requireString(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestError(`${field} is required`);
  }
  return value.trim().slice(0, maxLength);
}

export function optionalString(
  value: unknown,
  maxLength = 500
): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, maxLength);
}

export function requireInt(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new BadRequestError(`${field} must be a number`);
  return Math.round(parsed);
}

export function optionalInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

export function optionalFloat(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function optionalBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function optionalDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof BadRequestError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("[financialos] unexpected error", error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
