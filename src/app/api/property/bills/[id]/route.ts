import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPropertyRoute, assertBillInHousehold } from "@/lib/propertyos/authz";
import { parseDay } from "@/lib/travelos/dates";
import { BILL_CATEGORY_LABELS, CADENCE_LABELS } from "@/lib/propertyos/bills";

const CATEGORIES = Object.keys(BILL_CATEGORY_LABELS);
const CADENCES = Object.keys(CADENCE_LABELS);
const STATUSES = ["ACTIVE", "PAUSED", "CLOSED"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardPropertyRoute("MANAGE");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const bill = await assertBillInHousehold(guard.household.id, id);
  if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body?.name === "string" && body.name.trim()) {
    data.name = body.name.trim().slice(0, 100);
  }
  if (CATEGORIES.includes(body?.category)) data.category = body.category;
  if (CADENCES.includes(body?.cadence)) data.cadence = body.cadence;
  if (STATUSES.includes(body?.status)) data.status = body.status;
  if (typeof body?.autopay === "boolean") data.autopay = body.autopay;
  if (body?.typicalAmountCents !== undefined) {
    data.typicalAmountCents = Math.max(Math.round(Number(body.typicalAmountCents) || 0), 0);
  }
  if (body?.nextDueDate !== undefined) data.nextDueDate = parseDay(body.nextDueDate);
  if (body?.dueDayOfMonth !== undefined) {
    const day = Math.round(Number(body.dueDayOfMonth) || 0);
    data.dueDayOfMonth = day ? Math.min(Math.max(day, 1), 31) : null;
  }
  if (body?.notes !== undefined) {
    data.notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 400) || null : null;
  }
  if (body?.vendorId !== undefined) {
    if (body.vendorId) {
      const vendor = await db.vendor.findFirst({
        where: { id: body.vendorId, householdId: guard.household.id },
      });
      if (!vendor) return NextResponse.json({ error: "Unknown vendor" }, { status: 400 });
      data.vendorId = vendor.id;
    } else {
      data.vendorId = null;
    }
  }

  await db.propertyBill.update({ where: { id: bill.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardPropertyRoute("MANAGE");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const bill = await assertBillInHousehold(guard.household.id, id);
  if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.propertyBill.delete({ where: { id: bill.id } });
  return NextResponse.json({ ok: true });
}
