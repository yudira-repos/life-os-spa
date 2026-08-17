import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPropertyRoute, assertTaskInHousehold } from "@/lib/propertyos/authz";
import { addDays, startOfDay, today } from "@/lib/travelos/dates";

// Snooze exists so that "not this week" doesn't become "delete the task".
// Without it, people clear items they still intend to do, and the list stops
// reflecting the house.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardPropertyRoute("VIEW");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const task = await assertTaskInHousehold(guard.household.id, id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const days = Math.min(Math.max(Math.round(Number(body?.days) || 7), 1), 365);

  const snoozedUntil = addDays(startOfDay(today()), days);

  await db.maintenanceTask.update({
    where: { id: task.id },
    data: {
      snoozedUntil,
      status: "SNOOZED",
      // Push the due date along with the snooze, so the task doesn't reappear
      // as overdue the moment the snooze lapses.
      nextDueDate: task.nextDueDate < snoozedUntil ? snoozedUntil : task.nextDueDate,
    },
  });

  return NextResponse.json({ ok: true, snoozedUntil });
}
