import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  guardFinancialRoute,
  optionalString,
  errorResponse,
} from "@/lib/financialos/route-helpers";
import { accountVisibilityWhere } from "@/lib/financialos/authz";
import { auditFinancial } from "@/lib/financialos/audit";
import { CATEGORY_BY_KEY, isTransferCategory } from "@/lib/financialos/categories";

// Correcting a transaction. The important behaviour: a category set here is
// marked categorySource: "USER", and the sync path will never overwrite it.
// A correction that silently reverts on the next sync is worse than no
// correction feature at all.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardFinancialRoute("UPDATE_TRANSACTION");
  if (!guard.ok) return guard.response;
  const { user, household, scope } = guard.context;

  try {
    const { id } = await params;

    const transaction = await db.transaction.findFirst({
      where: {
        id,
        householdId: household.id,
        account: accountVisibilityWhere(scope),
      },
    });
    if (!transaction) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (typeof body?.categoryKey === "string") {
      if (!CATEGORY_BY_KEY[body.categoryKey]) {
        return NextResponse.json({ error: "Unknown category" }, { status: 400 });
      }
      data.categoryKey = body.categoryKey;
      data.categorySource = "USER";
      data.isTransfer = isTransferCategory(body.categoryKey);
    }

    if (typeof body?.isTransfer === "boolean") data.isTransfer = body.isTransfer;
    if (typeof body?.excludedFromCashflow === "boolean") {
      data.excludedFromCashflow = body.excludedFromCashflow;
    }
    if (body?.notes !== undefined) data.notes = optionalString(body.notes, 500);

    if (body?.goalId !== undefined) {
      const goalId = optionalString(body.goalId, 40);
      if (goalId) {
        const goal = await db.savingsGoal.findFirst({
          where: { id: goalId, householdId: household.id },
        });
        if (!goal) return NextResponse.json({ error: "Unknown goal" }, { status: 400 });
      }
      data.goalId = goalId;
    }

    await db.transaction.update({ where: { id: transaction.id }, data });

    await auditFinancial({
      householdId: household.id,
      actorUserId: user.id,
      action: "UPDATE_TRANSACTION",
      resource: "TRANSACTION",
      resourceId: transaction.id,
      meta: { fields: Object.keys(data).join(",") },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
