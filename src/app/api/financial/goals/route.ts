import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  guardFinancialRoute,
  requireString,
  optionalString,
  optionalInt,
  optionalDate,
  oneOf,
  errorResponse,
} from "@/lib/financialos/route-helpers";
import { auditFinancial } from "@/lib/financialos/audit";
import { TEMPLATE_BY_KEY, templateToGoalData } from "@/lib/financialos/goals";
import { buildFinancialContext } from "@/lib/financialos/profile";

const GOAL_KINDS = [
  "EMERGENCY",
  "VACATION",
  "PROPERTY",
  "EDUCATION",
  "VEHICLE",
  "WEDDING",
  "FUNERAL",
  "DEBT_PAYOFF",
  "HOME_REPAIR",
  "NEW_BABY",
  "CUSTOM",
] as const;

export async function POST(request: Request) {
  const guard = await guardFinancialRoute("CREATE_GOAL");
  if (!guard.ok) return guard.response;
  const { user, household, scope } = guard.context;

  try {
    const body = await request.json();

    // Template path: the suggested target is computed from this household's
    // actual numbers, not a generic figure.
    if (typeof body?.templateKey === "string") {
      const template = TEMPLATE_BY_KEY[body.templateKey];
      if (!template) {
        return NextResponse.json({ error: "Unknown template" }, { status: 400 });
      }

      const context = await buildFinancialContext(household.id, scope);
      const data = templateToGoalData(
        template,
        {
          monthlyEssential: context.monthlyEssentialCents / 100,
          monthlyIncome: context.cashflow.averageMonthlyIncomeCents / 100,
          annualIncome: context.householdIncome,
          emergencyMonths: context.emergencyFundMonthsTarget,
          childCount: context.children.length,
          stateCode: context.stateCode,
        },
        household.id
      );

      const goal = await db.savingsGoal.create({
        data: {
          ...data,
          forMemberId: optionalString(body?.forMemberId, 40),
          notes: optionalString(body?.notes, 500),
        },
      });

      await auditFinancial({
        householdId: household.id,
        actorUserId: user.id,
        action: "CREATE_GOAL",
        resource: "GOAL",
        resourceId: goal.id,
        meta: { template: template.key },
      });

      return NextResponse.json({ id: goal.id });
    }

    // Custom path.
    const name = requireString(body?.name, "Goal name", 120);
    const targetCents = Math.max(optionalInt(body?.targetCents, 0), 0);
    if (targetCents <= 0) {
      return NextResponse.json({ error: "Target amount is required" }, { status: 400 });
    }

    const goal = await db.savingsGoal.create({
      data: {
        householdId: household.id,
        name,
        kind: oneOf(body?.kind, GOAL_KINDS, "CUSTOM"),
        targetCents,
        targetDate: optionalDate(body?.targetDate),
        monthlyContributionCents: Math.max(optionalInt(body?.monthlyContributionCents, 0), 0),
        currentCents: Math.max(optionalInt(body?.currentCents, 0), 0),
        forMemberId: optionalString(body?.forMemberId, 40),
        linkedAccountId: optionalString(body?.linkedAccountId, 40),
        priority: optionalInt(body?.priority, 100),
        notes: optionalString(body?.notes, 500),
      },
    });

    await auditFinancial({
      householdId: household.id,
      actorUserId: user.id,
      action: "CREATE_GOAL",
      resource: "GOAL",
      resourceId: goal.id,
    });

    return NextResponse.json({ id: goal.id });
  } catch (error) {
    return errorResponse(error);
  }
}
