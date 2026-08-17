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
import { STATE_TOP_MARGINAL_RATE } from "@/lib/financialos/constants";

const FILING_STATUSES = [
  "SINGLE",
  "MARRIED_JOINT",
  "MARRIED_SEPARATE",
  "HEAD_OF_HOUSEHOLD",
] as const;
const RISK = ["CONSERVATIVE", "MODERATE", "AGGRESSIVE"] as const;
const LITERACY = ["BEGINNER", "LEARNING", "CONFIDENT"] as const;

export async function PUT(request: Request) {
  const guard = await guardFinancialRoute("UPDATE_PROFILE");
  if (!guard.ok) return guard.response;
  const { user, household } = guard.context;

  try {
    const body = await request.json();

    const stateCode = String(body?.stateCode ?? "CA").toUpperCase().slice(0, 2);
    if (!(stateCode in STATE_TOP_MARGINAL_RATE)) {
      return NextResponse.json({ error: "Unknown state code" }, { status: 400 });
    }

    const data = {
      filingStatus: oneOf(body?.filingStatus, FILING_STATUSES, "MARRIED_JOINT"),
      stateCode,
      // Clamped rather than rejected: a typo shouldn't block the form, but a
      // 400-month emergency fund shouldn't reach the engine either.
      emergencyFundMonthsTarget: Math.min(
        Math.max(optionalInt(body?.emergencyFundMonthsTarget, 6), 1),
        24
      ),
      riskTolerance: oneOf(body?.riskTolerance, RISK, "MODERATE"),
      financialLiteracy: oneOf(body?.financialLiteracy, LITERACY, "BEGINNER"),
      hasWill: optionalBool(body?.hasWill),
      hasEstateBeneficiaries: optionalBool(body?.hasEstateBeneficiaries),
      highInterestDebtCents: Math.max(optionalInt(body?.highInterestDebtCents, 0), 0),
      highInterestDebtApr: Math.min(Math.max(optionalFloat(body?.highInterestDebtApr, 0), 0), 1),
    };

    await db.financialProfile.upsert({
      where: { householdId: household.id },
      create: { householdId: household.id, ...data },
      update: data,
    });

    await auditFinancial({
      householdId: household.id,
      actorUserId: user.id,
      action: "UPDATE_PROFILE",
      resource: "PROFILE",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
