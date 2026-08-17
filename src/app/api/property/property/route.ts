import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPropertyRoute } from "@/lib/propertyos/authz";
import { seedMaintenanceTasks } from "@/lib/propertyos/service";
import { STATE_TOP_MARGINAL_RATE } from "@/lib/financialos/constants";

const PROPERTY_TYPES = ["SINGLE_FAMILY", "CONDO", "TOWNHOME", "MULTI_FAMILY", "OTHER"] as const;

// Create or update the property. Saving conditions (softener, trees, hard
// water) re-seeds the maintenance list, because those facts are exactly what
// decides which tasks apply.

export async function PUT(request: Request) {
  const guard = await guardPropertyRoute("MANAGE");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));

  const stateCode = String(body?.stateCode ?? "CA").toUpperCase().slice(0, 2);
  if (!(stateCode in STATE_TOP_MARGINAL_RATE)) {
    return NextResponse.json({ error: "Unknown state code" }, { status: 400 });
  }

  const data = {
    name: str(body?.name, 80) || "Home",
    addressLine: str(body?.addressLine, 200) || null,
    city: str(body?.city, 80) || null,
    stateCode,
    postalCode: str(body?.postalCode, 12) || null,
    propertyType: PROPERTY_TYPES.includes(body?.propertyType) ? body.propertyType : "SINGLE_FAMILY",
    yearBuilt: intOrNull(body?.yearBuilt, 1600, 2100),
    squareFeet: intOrNull(body?.squareFeet, 100, 100_000),
    assessedValueCents: Math.max(int(body?.assessedValueCents, 0), 0) || null,
    taxRatePercent: floatOrNull(body?.taxRatePercent, 0, 10),
    hasWaterSoftener: bool(body?.hasWaterSoftener),
    hasIrrigation: bool(body?.hasIrrigation),
    hasPool: bool(body?.hasPool),
    hasSepticTank: bool(body?.hasSepticTank),
    hasFireplace: bool(body?.hasFireplace),
    hardWater: bool(body?.hardWater),
    dustyOrSmoky: bool(body?.dustyOrSmoky),
    heavyTreeCover: bool(body?.heavyTreeCover),
  };

  const existing = await db.property.findFirst({
    where: { householdId: guard.household.id },
    orderBy: { createdAt: "asc" },
  });

  const property = existing
    ? await db.property.update({ where: { id: existing.id }, data })
    : await db.property.create({ data: { householdId: guard.household.id, ...data } });

  // Adding a softener should add the salt task; removing the pool shouldn't
  // delete the history of pool servicing, so seeding only ever adds.
  const seeded = await seedMaintenanceTasks(guard.household.id, property.id);

  return NextResponse.json({
    propertyId: property.id,
    created: !existing,
    tasksAdded: seeded.created,
  });
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function int(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}
function intOrNull(value: unknown, min: number, max: number): number | null {
  const parsed = int(value, NaN);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(parsed, min), max);
}
function floatOrNull(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  return Math.min(Math.max(parsed, min), max);
}
function bool(value: unknown): boolean {
  return value === true;
}
