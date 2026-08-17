import { NextResponse } from "next/server";
import { guardFinancialRoute, requireString, errorResponse } from "@/lib/financialos/route-helpers";
import { auditFinancial } from "@/lib/financialos/audit";
import { generatePlan } from "@/lib/financialos/advice/engine";
import { explainRecommendation, type LiteracyLevel } from "@/lib/financialos/explain";
import { getFinancialProfile } from "@/lib/financialos/profile";

// Rewrite one recommendation in plainer language.
//
// The recommendation is regenerated server-side from the household's real
// data rather than accepted from the request body. Otherwise a caller could
// post an arbitrary "recommendation" and use this endpoint as a general
// purpose LLM proxy on our API key.

export async function POST(request: Request) {
  const guard = await guardFinancialRoute("EXPLAIN_RECOMMENDATION");
  if (!guard.ok) return guard.response;
  const { user, household, scope } = guard.context;

  try {
    const body = await request.json();
    const recommendationId = requireString(body?.recommendationId, "recommendationId", 80);

    const plan = await generatePlan(household.id, scope);
    const recommendation = plan.recommendations.find((r) => r.id === recommendationId);
    if (!recommendation) {
      return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
    }

    const profile = await getFinancialProfile(household.id);
    const literacy = profile.financialLiteracy as LiteracyLevel;

    const { text, source } = await explainRecommendation(recommendation, literacy);

    await auditFinancial({
      householdId: household.id,
      actorUserId: user.id,
      action: "EXPLAIN_RECOMMENDATION",
      resource: "RECOMMENDATION",
      resourceId: recommendationId,
      meta: { source },
    });

    return NextResponse.json({ text, source });
  } catch (error) {
    return errorResponse(error);
  }
}
