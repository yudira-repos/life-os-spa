import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardFinancialRoute } from "@/lib/financialos/route-helpers";
import { auditFinancial } from "@/lib/financialos/audit";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardFinancialRoute("DELETE_POLICY");
  if (!guard.ok) return guard.response;
  const { user, household } = guard.context;

  const { id } = await params;
  const policy = await db.insurancePolicy.findFirst({
    where: { id, householdId: household.id },
  });
  if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.insurancePolicy.delete({ where: { id: policy.id } });

  await auditFinancial({
    householdId: household.id,
    actorUserId: user.id,
    action: "DELETE_POLICY",
    resource: "POLICY",
    resourceId: policy.id,
  });

  return NextResponse.json({ ok: true });
}
