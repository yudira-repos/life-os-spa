import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  guardFinancialRoute,
  optionalInt,
  optionalFloat,
  optionalBool,
  oneOf,
  errorResponse,
} from "@/lib/financialos/route-helpers";
import { auditFinancial } from "@/lib/financialos/audit";

const PLAN_TYPES = [
  "401K",
  "403B",
  "457B",
  "SIMPLE_IRA",
  "SEP_IRA",
  "SOLO_401K",
  "NONE",
] as const;
const COVERAGE = ["NONE", "SELF", "FAMILY"] as const;

// The workplace-plan facts the advice engine refuses to guess at.
//
// planAllowsAfterTax / planAllowsInPlanRoth / planAllowsInServiceW are the
// three that gate the Mega Backdoor Roth. They're asked rather than inferred
// because inferring them wrong produces a recommendation someone can't act on
// — which is worse than saying "check with your plan administrator".

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const guard = await guardFinancialRoute("UPDATE_EARNER");
  if (!guard.ok) return guard.response;
  const { user, household } = guard.context;

  try {
    const { memberId } = await params;

    // Only adults get earner profiles, and only members of this household.
    const member = await db.householdMember.findFirst({
      where: { id: memberId, householdId: household.id, role: { in: ["OWNER", "ADULT"] } },
    });
    if (!member) {
      return NextResponse.json({ error: "Adult member not found" }, { status: 404 });
    }

    const body = await request.json();

    const data = {
      annualSalaryCents: Math.max(optionalInt(body?.annualSalaryCents, 0), 0),
      annualBonusCents: Math.max(optionalInt(body?.annualBonusCents, 0), 0),
      selfEmployed: optionalBool(body?.selfEmployed),

      hasWorkplacePlan: optionalBool(body?.hasWorkplacePlan),
      planType: oneOf(body?.planType, PLAN_TYPES, "401K"),
      employerMatchPercent: clampPercent(body?.employerMatchPercent, 200),
      employerMatchLimitPercent: clampPercent(body?.employerMatchLimitPercent, 100),
      currentDeferralPercent: clampPercent(body?.currentDeferralPercent, 100),
      currentDeferralIsRoth: optionalBool(body?.currentDeferralIsRoth),
      planAllowsAfterTax: optionalBool(body?.planAllowsAfterTax),
      planAllowsInPlanRoth: optionalBool(body?.planAllowsInPlanRoth),
      planAllowsInServiceW: optionalBool(body?.planAllowsInServiceW),
      employerContribCents: Math.max(optionalInt(body?.employerContribCents, 0), 0),

      traditionalIraBalanceCents: Math.max(optionalInt(body?.traditionalIraBalanceCents, 0), 0),
      currentIraContribCents: Math.max(optionalInt(body?.currentIraContribCents, 0), 0),

      hsaEligible: optionalBool(body?.hsaEligible),
      hsaCoverage: oneOf(body?.hsaCoverage, COVERAGE, "NONE"),
      currentHsaContribCents: Math.max(optionalInt(body?.currentHsaContribCents, 0), 0),
      employerHsaContribCents: Math.max(optionalInt(body?.employerHsaContribCents, 0), 0),
    };

    await db.earnerProfile.upsert({
      where: { memberId: member.id },
      create: { memberId: member.id, ...data },
      update: data,
    });

    await auditFinancial({
      householdId: household.id,
      actorUserId: user.id,
      action: "UPDATE_EARNER",
      resource: "EARNER",
      resourceId: member.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

function clampPercent(value: unknown, max: number): number {
  return Math.min(Math.max(optionalFloat(value, 0), 0), max);
}
