import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  guardFinancialRoute,
  optionalString,
  optionalInt,
  optionalDate,
  oneOf,
  errorResponse,
} from "@/lib/financialos/route-helpers";
import { auditFinancial } from "@/lib/financialos/audit";

const POLICY_TYPES = [
  "TERM_LIFE",
  "WHOLE_LIFE",
  "UNIVERSAL_LIFE",
  "DISABILITY",
  "UMBRELLA",
] as const;

export async function POST(request: Request) {
  const guard = await guardFinancialRoute("CREATE_POLICY");
  if (!guard.ok) return guard.response;
  const { user, household } = guard.context;

  try {
    const body = await request.json();

    const memberId = optionalString(body?.memberId, 40);
    if (memberId) {
      const member = await db.householdMember.findFirst({
        where: { id: memberId, householdId: household.id },
      });
      if (!member) return NextResponse.json({ error: "Unknown member" }, { status: 400 });
    }

    const policy = await db.insurancePolicy.create({
      data: {
        householdId: household.id,
        memberId,
        type: oneOf(body?.type, POLICY_TYPES, "TERM_LIFE"),
        carrier: optionalString(body?.carrier, 120),
        coverageCents: Math.max(optionalInt(body?.coverageCents, 0), 0),
        annualPremiumCents: Math.max(optionalInt(body?.annualPremiumCents, 0), 0),
        termYears: body?.termYears ? optionalInt(body.termYears, 0) : null,
        startDate: optionalDate(body?.startDate),
        endDate: optionalDate(body?.endDate),
        beneficiary: optionalString(body?.beneficiary, 120),
        notes: optionalString(body?.notes, 500),
      },
    });

    await auditFinancial({
      householdId: household.id,
      actorUserId: user.id,
      action: "CREATE_POLICY",
      resource: "POLICY",
      resourceId: policy.id,
      meta: { type: policy.type },
    });

    return NextResponse.json({ id: policy.id });
  } catch (error) {
    return errorResponse(error);
  }
}
