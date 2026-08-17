import { NextResponse } from "next/server";
import { guardPropertyRoute } from "@/lib/propertyos/authz";
import { buildDashboard } from "@/lib/propertyos/service";
import { syncHomeMaintenanceFund } from "@/lib/propertyos/integrations";

// Push this house's real cost of ownership into the FinancialOS home
// maintenance goal, replacing the template's generic placeholder with a
// number derived from the actual schedule and equipment.

export async function POST() {
  const guard = await guardPropertyRoute("MANAGE");
  if (!guard.ok) return guard.response;

  const dashboard = await buildDashboard(guard.household.id, { includeCosts: true });

  const result = await syncHomeMaintenanceFund({
    householdId: guard.household.id,
    annualMaintenanceCents: dashboard.costs.annualMaintenanceCents,
    annualReserveCents: dashboard.costs.annualReserveCents,
  });

  if (!result) {
    return NextResponse.json({
      synced: false,
      reason:
        dashboard.costs.annualMaintenanceCents + dashboard.costs.annualReserveCents <= 0
          ? "There's nothing to size a fund from yet — add maintenance tasks and equipment first."
          : "FinancialOS isn't enabled for this household, so there's no goal to update.",
    });
  }

  return NextResponse.json({ synced: true, ...result });
}
