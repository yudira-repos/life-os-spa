import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPropertyRoute } from "@/lib/propertyos/authz";
import { getPrimaryProperty } from "@/lib/propertyos/service";
import { parseDay } from "@/lib/travelos/dates";
import { EQUIPMENT_KINDS, type EquipmentKind } from "@/lib/propertyos/equipment";

const KINDS = Object.keys(EQUIPMENT_KINDS);

export async function POST(request: Request) {
  const guard = await guardPropertyRoute("VIEW");
  if (!guard.ok) return guard.response;

  const property = await getPrimaryProperty(guard.household.id);
  if (!property) {
    return NextResponse.json({ error: "Add your property details first." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const kind = (KINDS.includes(body?.kind) ? body.kind : "OTHER") as EquipmentKind;
  const meta = EQUIPMENT_KINDS[kind];

  const equipment = await db.equipment.create({
    data: {
      propertyId: property.id,
      householdId: guard.household.id,
      name,
      kind,
      // Default from the catalog — a camera is internet-connected whether or
      // not someone remembers to tick the box.
      isIot: typeof body?.isIot === "boolean" ? body.isIot : meta.isIot,
      brand: str(body?.brand, 60),
      model: str(body?.model, 80),
      serialNumber: str(body?.serialNumber, 80),
      installedOn: parseDay(body?.installedOn),
      warrantyExpiresOn: parseDay(body?.warrantyExpiresOn),
      expectedLifeYears: clampYears(body?.expectedLifeYears) ?? meta.expectedLifeYears,
      // The two things nobody can find when they need them.
      filterSize: str(body?.filterSize, 40),
      batteryType: str(body?.batteryType, 40),
      notes: str(body?.notes, 400),
    },
  });

  return NextResponse.json({
    id: equipment.id,
    suggestedTasks: meta.relatedTaskKeys,
  });
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, max) || null;
}

function clampYears(value: unknown): number | null {
  const parsed = Math.round(Number(value) || 0);
  if (!parsed) return null;
  return Math.min(Math.max(parsed, 1), 60);
}
