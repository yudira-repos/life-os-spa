import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardFinancialRoute } from "@/lib/financialos/route-helpers";
import { auditFinancial } from "@/lib/financialos/audit";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardFinancialRoute("DELETE_RULE");
  if (!guard.ok) return guard.response;
  const { user, household } = guard.context;

  const { id } = await params;
  const rule = await db.categoryRule.findFirst({
    where: { id, householdId: household.id },
  });
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.categoryRule.delete({ where: { id: rule.id } });

  await auditFinancial({
    householdId: household.id,
    actorUserId: user.id,
    action: "DELETE_RULE",
    resource: "RULE",
    resourceId: rule.id,
  });

  return NextResponse.json({ ok: true });
}
