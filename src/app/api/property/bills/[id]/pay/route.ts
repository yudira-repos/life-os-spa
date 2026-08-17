import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPropertyRoute, assertBillInHousehold } from "@/lib/propertyos/authz";
import { getPrimaryProperty } from "@/lib/propertyos/service";
import { parseDay, startOfDay, today } from "@/lib/travelos/dates";
import { nextBillDueDate, priceJump, type Cadence } from "@/lib/propertyos/bills";

// Record a payment and roll the bill forward.
//
// Two things happen that are worth stating: the next due date is computed
// from the CALENDAR, not from the payment date (paying late doesn't shift
// next month's bill), and the amount is checked against this bill's own
// history so a jump gets flagged while you're looking at it.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardPropertyRoute("MANAGE");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const bill = await assertBillInHousehold(guard.household.id, id);
  if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const amountCents = Math.max(Math.round(Number(body?.amountCents) || 0), 0);
  if (amountCents <= 0) {
    return NextResponse.json({ error: "How much was it?" }, { status: 400 });
  }

  const paidOn = parseDay(body?.paidOn) ?? startOfDay(today());

  const history = await db.billPayment.findMany({
    where: { billId: bill.id },
    orderBy: { paidOn: "desc" },
    take: 12,
    select: { amountCents: true },
  });

  const jump = priceJump(amountCents, history.map((p) => p.amountCents));

  const property = await getPrimaryProperty(guard.household.id);
  const nextDue = bill.nextDueDate
    ? nextBillDueDate({
        cadence: bill.cadence as Cadence,
        currentDue: bill.nextDueDate,
        dueDayOfMonth: bill.dueDayOfMonth,
        stateCode: property?.stateCode,
        category: bill.category,
      })
    : null;

  await db.$transaction([
    db.billPayment.create({
      data: {
        billId: bill.id,
        amountCents,
        paidOn,
        source: "MANUAL",
        note: typeof body?.note === "string" ? body.note.trim().slice(0, 200) || null : null,
      },
    }),
    db.propertyBill.update({
      where: { id: bill.id },
      data: {
        lastPaidAt: paidOn,
        lastPaidCents: amountCents,
        nextDueDate: nextDue,
        // Keep the typical amount tracking reality, but move it gently so one
        // unusual month doesn't redefine what "typical" means.
        typicalAmountCents:
          bill.typicalAmountCents > 0
            ? Math.round(bill.typicalAmountCents * 0.7 + amountCents * 0.3)
            : amountCents,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    nextDueDate: nextDue,
    priceJump: jump.jumped
      ? {
          averageCents: jump.averageCents,
          deltaCents: jump.deltaCents,
          percent: Math.round(jump.percent * 100),
        }
      : null,
  });
}
