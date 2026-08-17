import { NextResponse } from "next/server";
import { guardPropertyRoute } from "@/lib/propertyos/authz";
import { getPrimaryProperty, seedMaintenanceTasks } from "@/lib/propertyos/service";

export async function POST() {
  const guard = await guardPropertyRoute("MANAGE");
  if (!guard.ok) return guard.response;

  const property = await getPrimaryProperty(guard.household.id);
  if (!property) {
    return NextResponse.json(
      { error: "Add your property details first — the task list depends on what the house has." },
      { status: 400 }
    );
  }

  const result = await seedMaintenanceTasks(guard.household.id, property.id);

  return NextResponse.json({
    created: result.created,
    alreadyTracked: result.skipped,
    note:
      result.created === 0
        ? "Everything that applies to this house is already on the list."
        : undefined,
  });
}
