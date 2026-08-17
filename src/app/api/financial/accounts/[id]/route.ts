import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  guardFinancialRoute,
  optionalString,
  optionalInt,
  oneOf,
  errorResponse,
} from "@/lib/financialos/route-helpers";
import { assertAccountInHousehold } from "@/lib/financialos/authz";
import { auditFinancial } from "@/lib/financialos/audit";

const VISIBILITIES = ["HOUSEHOLD", "OWNER_ONLY"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardFinancialRoute("UPDATE_ACCOUNT");
  if (!guard.ok) return guard.response;
  const { user, household, scope } = guard.context;

  try {
    const { id } = await params;
    const account = await assertAccountInHousehold(household.id, id, scope);
    if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (typeof body?.name === "string") data.name = body.name.trim().slice(0, 120);
    if (typeof body?.includeInNetWorth === "boolean") {
      data.includeInNetWorth = body.includeInNetWorth;
    }
    if (typeof body?.visibility === "string") {
      data.visibility = oneOf(body.visibility, VISIBILITIES, account.visibility as "HOUSEHOLD");
    }
    if (body?.ownerMemberId !== undefined) {
      data.ownerMemberId = optionalString(body.ownerMemberId, 40);
    }
    if (body?.closed === true) data.closedAt = new Date();
    if (body?.closed === false) data.closedAt = null;

    // Balance is only editable on manual accounts — a linked account's balance
    // comes from the institution, and letting someone type over it would make
    // the next sync silently "revert" their edit.
    if (account.isManual && body?.balanceCents !== undefined) {
      const raw = optionalInt(body.balanceCents, account.currentBalanceCents);
      const isLiability = account.type === "CREDIT" || account.type === "LOAN";
      data.currentBalanceCents = isLiability ? -Math.abs(raw) : raw;
      data.lastRefreshedAt = new Date();
    }

    await db.financialAccount.update({ where: { id: account.id }, data });

    await auditFinancial({
      householdId: household.id,
      actorUserId: user.id,
      action: "UPDATE_ACCOUNT",
      resource: "ACCOUNT",
      resourceId: account.id,
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
  const guard = await guardFinancialRoute("DELETE_ACCOUNT");
  if (!guard.ok) return guard.response;
  const { user, household, scope } = guard.context;

  const { id } = await params;
  const account = await assertAccountInHousehold(household.id, id, scope);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!account.isManual) {
    return NextResponse.json(
      {
        error:
          "This account comes from a linked bank. Unlink the institution instead — deleting it here would just reappear on the next sync.",
      },
      { status: 409 }
    );
  }

  await db.financialAccount.delete({ where: { id: account.id } });

  await auditFinancial({
    householdId: household.id,
    actorUserId: user.id,
    action: "DELETE_ACCOUNT",
    resource: "ACCOUNT",
    resourceId: account.id,
  });

  return NextResponse.json({ ok: true });
}
