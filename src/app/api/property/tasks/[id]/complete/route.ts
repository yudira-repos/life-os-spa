import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPropertyRoute, assertTaskInHousehold } from "@/lib/propertyos/authz";
import { parseDay, startOfDay, today } from "@/lib/travelos/dates";
import { nextDueAfterCompletion, describeDue } from "@/lib/propertyos/schedule";

// Mark a task done.
//
// THE important line in this file: the next due date is computed from when the
// work was ACTUALLY done, not from when it was scheduled. A 90-day filter
// change that was due March 1 and done March 20 is next due June 18. Anchoring
// to the due date instead would leave every overdue task permanently overdue,
// and a list that's permanently red is a list people stop opening.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Completing is VIEW-tier — whoever did the job can log it. Recording a
  // COST is manager-tier, handled below.
  const guard = await guardPropertyRoute("VIEW");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const task = await assertTaskInHousehold(guard.household.id, id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const completedAt = parseDay(body?.completedAt) ?? startOfDay(today());

  let vendorId: string | null = null;
  if (typeof body?.vendorId === "string" && body.vendorId) {
    const vendor = await db.vendor.findFirst({
      where: { id: body.vendorId, householdId: guard.household.id },
    });
    if (!vendor) return NextResponse.json({ error: "Unknown vendor" }, { status: 400 });
    vendorId = vendor.id;
  }

  const costCents = guard.canManage
    ? Math.max(Math.round(Number(body?.costCents) || 0), 0)
    : 0;

  const seasonalMonths = task.seasonalMonths
    ? task.seasonalMonths.split(",").map(Number).filter((m) => m >= 1 && m <= 12)
    : [];

  const nextDueDate = nextDueAfterCompletion({
    completedAt,
    intervalDays: task.intervalDays,
    seasonalMonths,
  });

  await db.$transaction([
    db.maintenanceLog.create({
      data: {
        taskId: task.id,
        completedAt,
        costCents,
        vendorId,
        notes: typeof body?.notes === "string" ? body.notes.trim().slice(0, 400) || null : null,
      },
    }),
    db.maintenanceTask.update({
      where: { id: task.id },
      data: {
        lastCompletedAt: completedAt,
        nextDueDate,
        snoozedUntil: null,
        status: "ACTIVE",
      },
    }),
  ]);

  if (vendorId) {
    await db.vendor.update({
      where: { id: vendorId },
      data: { lastUsedAt: completedAt },
    });
  }

  return NextResponse.json({
    ok: true,
    nextDueDate,
    nextDueDescription: describeDue(nextDueDate),
  });
}
