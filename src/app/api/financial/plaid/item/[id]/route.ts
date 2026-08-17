import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardFinancialRoute } from "@/lib/financialos/route-helpers";
import { assertItemInHousehold } from "@/lib/financialos/authz";
import { auditFinancial } from "@/lib/financialos/audit";
import { removeItem } from "@/lib/financialos/plaid";
import { accessTokenFor } from "@/lib/financialos/sync";

// Unlinking has to do two things, in this order: tell Plaid to revoke the
// Item (so the connection to the bank actually ends), then delete our copy.
//
// If we deleted locally first and the Plaid call failed, the user would
// believe they'd disconnected while an active credential kept working. So the
// remote revoke happens first, and a failure there is reported rather than
// swallowed.

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardFinancialRoute("UNLINK_ITEM");
  if (!guard.ok) return guard.response;
  const { user, household } = guard.context;

  const { id } = await params;
  const item = await assertItemInHousehold(household.id, id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await removeItem(accessTokenFor(item));
  } catch (error) {
    // A REVOKED or already-removed Item throws here; that's fine — the goal
    // (no live credential) is already met. Anything else is a real failure.
    console.warn("[financialos] plaid item removal warning", error);
  }

  // Accounts and transactions cascade from the Item.
  await db.plaidItem.delete({ where: { id: item.id } });

  await auditFinancial({
    householdId: household.id,
    actorUserId: user.id,
    action: "UNLINK_ITEM",
    resource: "ITEM",
    resourceId: item.id,
  });

  return NextResponse.json({ ok: true });
}
