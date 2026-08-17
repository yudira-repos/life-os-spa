import { NextResponse } from "next/server";
import { guardFinancialRoute } from "@/lib/financialos/route-helpers";
import { auditFinancial } from "@/lib/financialos/audit";
import { syncHousehold } from "@/lib/financialos/sync";

export async function POST() {
  const guard = await guardFinancialRoute("SYNC_TRANSACTIONS");
  if (!guard.ok) return guard.response;
  const { user, household } = guard.context;

  const results = await syncHousehold(household.id);

  await auditFinancial({
    householdId: household.id,
    actorUserId: user.id,
    action: "SYNC_TRANSACTIONS",
    resource: "ITEM",
    meta: {
      itemCount: results.length,
      addedCount: results.reduce((sum, r) => sum + r.transactions.added, 0),
      failedCount: results.filter((r) => r.status !== "GOOD").length,
    },
  });

  return NextResponse.json({
    results,
    // Surfaced so the UI can prompt for re-authentication rather than
    // silently showing stale balances forever.
    needsReauth: results
      .filter((r) => r.status === "LOGIN_REQUIRED")
      .map((r) => r.itemId),
  });
}
