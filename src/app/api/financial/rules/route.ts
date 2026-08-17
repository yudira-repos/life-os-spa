import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  guardFinancialRoute,
  requireString,
  optionalInt,
  optionalBool,
  oneOf,
  errorResponse,
} from "@/lib/financialos/route-helpers";
import { auditFinancial } from "@/lib/financialos/audit";
import { CATEGORY_BY_KEY } from "@/lib/financialos/categories";
import { recategorizeHistory } from "@/lib/financialos/categorize";

const MATCH_FIELDS = ["NAME", "MERCHANT"] as const;
const MATCH_TYPES = ["CONTAINS", "EQUALS", "STARTS_WITH"] as const;

export async function POST(request: Request) {
  const guard = await guardFinancialRoute("CREATE_RULE");
  if (!guard.ok) return guard.response;
  const { user, household } = guard.context;

  try {
    const body = await request.json();
    const pattern = requireString(body?.pattern, "Pattern", 120);
    const categoryKey = requireString(body?.categoryKey, "Category", 60);

    if (!CATEGORY_BY_KEY[categoryKey]) {
      return NextResponse.json({ error: "Unknown category" }, { status: 400 });
    }

    const rule = await db.categoryRule.create({
      data: {
        householdId: household.id,
        pattern,
        categoryKey,
        matchField: oneOf(body?.matchField, MATCH_FIELDS, "NAME"),
        matchType: oneOf(body?.matchType, MATCH_TYPES, "CONTAINS"),
        markAsTransfer: optionalBool(body?.markAsTransfer),
        priority: optionalInt(body?.priority, 100),
      },
    });

    // Apply to history immediately. A rule that only affects future syncs
    // leaves the past looking wrong and makes the feature feel broken.
    const updated = await recategorizeHistory(household.id);

    await auditFinancial({
      householdId: household.id,
      actorUserId: user.id,
      action: "CREATE_RULE",
      resource: "RULE",
      resourceId: rule.id,
      meta: { recategorized: updated },
    });

    return NextResponse.json({ id: rule.id, recategorized: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
