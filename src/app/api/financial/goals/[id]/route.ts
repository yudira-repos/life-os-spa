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
import { assertGoalInHousehold } from "@/lib/financialos/authz";
import { auditFinancial } from "@/lib/financialos/audit";

const STATUSES = ["ACTIVE", "PAUSED", "COMPLETE"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardFinancialRoute("UPDATE_GOAL");
  if (!guard.ok) return guard.response;
  const { user, household } = guard.context;

  try {
    const { id } = await params;
    const goal = await assertGoalInHousehold(household.id, id);
    if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (typeof body?.name === "string") data.name = body.name.trim().slice(0, 120);
    if (body?.targetCents !== undefined) {
      data.targetCents = Math.max(optionalInt(body.targetCents, goal.targetCents), 0);
    }
    if (body?.monthlyContributionCents !== undefined) {
      data.monthlyContributionCents = Math.max(
        optionalInt(body.monthlyContributionCents, goal.monthlyContributionCents),
        0
      );
    }
    if (body?.currentCents !== undefined) {
      data.currentCents = Math.max(optionalInt(body.currentCents, goal.currentCents), 0);
    }
    if (body?.targetDate !== undefined) data.targetDate = optionalDate(body.targetDate);
    if (typeof body?.status === "string") {
      data.status = oneOf(body.status, STATUSES, goal.status as "ACTIVE");
    }
    if (body?.notes !== undefined) data.notes = optionalString(body.notes, 500);
    if (body?.priority !== undefined) data.priority = optionalInt(body.priority, goal.priority);

    await db.savingsGoal.update({ where: { id: goal.id }, data });

    await auditFinancial({
      householdId: household.id,
      actorUserId: user.id,
      action: "UPDATE_GOAL",
      resource: "GOAL",
      resourceId: goal.id,
      meta: { fields: Object.keys(data).join(",") },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardFinancialRoute("DELETE_GOAL");
  if (!guard.ok) return guard.response;
  const { user, household } = guard.context;

  const { id } = await params;
  const goal = await assertGoalInHousehold(household.id, id);
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Transactions earmarked to this goal shouldn't be deleted with it — just
  // unlinked, so spending history stays intact.
  await db.transaction.updateMany({
    where: { goalId: goal.id },
    data: { goalId: null },
  });
  await db.savingsGoal.delete({ where: { id: goal.id } });

  await auditFinancial({
    householdId: household.id,
    actorUserId: user.id,
    action: "DELETE_GOAL",
    resource: "GOAL",
    resourceId: goal.id,
  });

  return NextResponse.json({ ok: true });
}
