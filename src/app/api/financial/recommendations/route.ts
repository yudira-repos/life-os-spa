import { NextResponse } from "next/server";
import { guardFinancialRoute } from "@/lib/financialos/route-helpers";
import { auditFinancial } from "@/lib/financialos/audit";
import { generateAndPersistPlan } from "@/lib/financialos/advice/engine";

export async function POST() {
  const guard = await guardFinancialRoute("GENERATE_RECOMMENDATIONS");
  if (!guard.ok) return guard.response;
  const { user, household, scope } = guard.context;

  const plan = await generateAndPersistPlan(household.id, scope);

  await auditFinancial({
    householdId: household.id,
    actorUserId: user.id,
    action: "GENERATE_RECOMMENDATIONS",
    resource: "RECOMMENDATION",
    meta: {
      engineVersion: plan.engineVersion,
      actionCount: plan.summary.actionCount,
      criticalCount: plan.summary.criticalCount,
    },
  });

  return NextResponse.json(plan);
}
