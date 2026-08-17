import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  guardFinancialRoute,
  optionalInt,
  optionalString,
  errorResponse,
} from "@/lib/financialos/route-helpers";
import { assertGoalInHousehold } from "@/lib/financialos/authz";
import { auditFinancial } from "@/lib/financialos/audit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardFinancialRoute("CONTRIBUTE_GOAL");
  if (!guard.ok) return guard.response;
  const { user, household } = guard.context;

  try {
    const { id } = await params;
    const goal = await assertGoalInHousehold(household.id, id);
    if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const amountCents = optionalInt(body?.amountCents, 0);
    if (amountCents === 0) {
      return NextResponse.json({ error: "Amount is required" }, { status: 400 });
    }

    // Ledger row and running total move together, so the balance can always
    // be re-derived from the contributions if they ever disagree.
    const [, updated] = await db.$transaction([
      db.goalContribution.create({
        data: {
          goalId: goal.id,
          amountCents,
          note: optionalString(body?.note, 200),
          source: "MANUAL",
        },
      }),
      db.savingsGoal.update({
        where: { id: goal.id },
        data: { currentCents: Math.max(goal.currentCents + amountCents, 0) },
      }),
    ]);

    // Auto-complete when the target is reached — one less thing to maintain
    // by hand, and it keeps the goals list honest.
    if (updated.currentCents >= updated.targetCents && updated.status === "ACTIVE") {
      await db.savingsGoal.update({
        where: { id: goal.id },
        data: { status: "COMPLETE" },
      });
    }

    await auditFinancial({
      householdId: household.id,
      actorUserId: user.id,
      action: "CONTRIBUTE_GOAL",
      resource: "GOAL",
      resourceId: goal.id,
      meta: { direction: amountCents > 0 ? "in" : "out" },
    });

    return NextResponse.json({ currentCents: updated.currentCents });
  } catch (error) {
    return errorResponse(error);
  }
}
