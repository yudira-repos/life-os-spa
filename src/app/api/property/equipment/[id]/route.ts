import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPropertyRoute, assertEquipmentInHousehold } from "@/lib/propertyos/authz";
import { parseDay } from "@/lib/travelos/dates";
import { EQUIPMENT_KINDS } from "@/lib/propertyos/equipment";

const KINDS = Object.keys(EQUIPMENT_KINDS);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardPropertyRoute("VIEW");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const equipment = await assertEquipmentInHousehold(guard.household.id, id);
  if (!equipment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body?.name === "string" && body.name.trim()) {
    data.name = body.name.trim().slice(0, 100);
  }
  if (KINDS.includes(body?.kind)) data.kind = body.kind;
  if (typeof body?.isIot === "boolean") data.isIot = body.isIot;

  for (const field of ["brand", "model", "serialNumber", "filterSize", "batteryType", "notes"] as const) {
    if (body?.[field] !== undefined) {
      data[field] =
        typeof body[field] === "string" ? body[field].trim().slice(0, 400) || null : null;
    }
  }
  if (body?.installedOn !== undefined) data.installedOn = parseDay(body.installedOn);
  if (body?.warrantyExpiresOn !== undefined) {
    data.warrantyExpiresOn = parseDay(body.warrantyExpiresOn);
  }
  if (body?.expectedLifeYears !== undefined) {
    const years = Math.round(Number(body.expectedLifeYears) || 0);
    data.expectedLifeYears = years ? Math.min(Math.max(years, 1), 60) : null;
  }

  await db.equipment.update({ where: { id: equipment.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardPropertyRoute("MANAGE");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const equipment = await assertEquipmentInHousehold(guard.household.id, id);
  if (!equipment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.equipment.delete({ where: { id: equipment.id } });
  return NextResponse.json({ ok: true });
}
