import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPropertyRoute } from "@/lib/propertyos/authz";
import { getPrimaryProperty } from "@/lib/propertyos/service";
import { parseDay } from "@/lib/travelos/dates";
import { nextTaxDeadline, BILL_CATEGORY_LABELS, CADENCE_LABELS } from "@/lib/propertyos/bills";

const CATEGORIES = Object.keys(BILL_CATEGORY_LABELS);
const CADENCES = Object.keys(CADENCE_LABELS);

export async function POST(request: Request) {
  const guard = await guardPropertyRoute("MANAGE");
  if (!guard.ok) return guard.response;

  const property = await getPrimaryProperty(guard.household.id);
  if (!property) {
    return NextResponse.json(
      { error: "Add your property details first — bills belong to a property." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));

  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const category = CATEGORIES.includes(body?.category) ? body.category : "OTHER";
  const cadence = CADENCES.includes(body?.cadence) ? body.cadence : "MONTHLY";

  // Property tax defaults to the state's own schedule rather than a generic
  // interval — that's the whole reason the schedule table exists.
  let nextDueDate = parseDay(body?.nextDueDate);
  if (!nextDueDate && category === "PROPERTY_TAX") {
    nextDueDate = nextTaxDeadline(property.stateCode)?.date ?? null;
  }

  let vendorId: string | null = null;
  if (typeof body?.vendorId === "string" && body.vendorId) {
    const vendor = await db.vendor.findFirst({
      where: { id: body.vendorId, householdId: guard.household.id },
    });
    if (!vendor) return NextResponse.json({ error: "Unknown vendor" }, { status: 400 });
    vendorId = vendor.id;
  }

  const bill = await db.propertyBill.create({
    data: {
      propertyId: property.id,
      householdId: guard.household.id,
      name,
      category,
      cadence,
      vendorId,
      typicalAmountCents: Math.max(intOf(body?.typicalAmountCents), 0),
      dueDayOfMonth: clampDay(body?.dueDayOfMonth),
      nextDueDate,
      autopay: body?.autopay === true,
      detectedKey: typeof body?.detectedKey === "string" ? body.detectedKey.slice(0, 120) : null,
      notes: typeof body?.notes === "string" ? body.notes.trim().slice(0, 400) || null : null,
    },
  });

  return NextResponse.json({ id: bill.id });
}

function intOf(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function clampDay(value: unknown): number | null {
  const parsed = intOf(value);
  if (!parsed) return null;
  return Math.min(Math.max(parsed, 1), 31);
}
