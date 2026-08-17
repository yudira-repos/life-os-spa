import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPropertyRoute, assertVendorInHousehold } from "@/lib/propertyos/authz";
import { TRADE_LABELS } from "@/lib/propertyos/equipment";

const TRADES = Object.keys(TRADE_LABELS);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardPropertyRoute("VIEW");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const vendor = await assertVendorInHousehold(guard.household.id, id);
  if (!vendor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body?.name === "string" && body.name.trim()) {
    data.name = body.name.trim().slice(0, 100);
  }
  if (TRADES.includes(body?.trade)) data.trade = body.trade;
  for (const field of ["phone", "email", "website", "notes"] as const) {
    if (body?.[field] !== undefined) {
      data[field] =
        typeof body[field] === "string" ? body[field].trim().slice(0, 400) || null : null;
    }
  }
  if (body?.rating !== undefined) {
    const rating = Math.round(Number(body.rating) || 0);
    data.rating = rating ? Math.min(Math.max(rating, 1), 5) : null;
  }
  if (guard.canManage && body?.hourlyRateCents !== undefined) {
    const rate = Math.max(Math.round(Number(body.hourlyRateCents) || 0), 0);
    data.hourlyRateCents = rate || null;
  }

  await db.vendor.update({ where: { id: vendor.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardPropertyRoute("MANAGE");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const vendor = await assertVendorInHousehold(guard.household.id, id);
  if (!vendor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Service history survives — the log rows keep their vendorId pointing at
  // nothing rather than losing "who did this last time" entirely. Bills and
  // tasks just lose the link.
  await db.propertyBill.updateMany({
    where: { vendorId: vendor.id },
    data: { vendorId: null },
  });
  await db.maintenanceTask.updateMany({
    where: { vendorId: vendor.id },
    data: { vendorId: null },
  });
  await db.maintenanceLog.updateMany({
    where: { vendorId: vendor.id },
    data: { vendorId: null },
  });
  await db.vendor.delete({ where: { id: vendor.id } });

  return NextResponse.json({ ok: true });
}
