import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPropertyRoute, assertTaskInHousehold } from "@/lib/propertyos/authz";
import { parseDay } from "@/lib/travelos/dates";
import { CATEGORY_LABELS, PRIORITY_LABELS } from "@/lib/propertyos/catalog";

const CATEGORIES = Object.keys(CATEGORY_LABELS);
const PRIORITIES = Object.keys(PRIORITY_LABELS);
const STATUSES = ["ACTIVE", "SNOOZED", "ARCHIVED"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardPropertyRoute("VIEW");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const task = await assertTaskInHousehold(guard.household.id, id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body?.name === "string" && body.name.trim()) {
    data.name = body.name.trim().slice(0, 120);
  }
  if (CATEGORIES.includes(body?.category)) data.category = body.category;
  if (PRIORITIES.includes(body?.priority)) data.priority = body.priority;
  if (STATUSES.includes(body?.status)) {
    data.status = body.status;
    if (body.status === "ACTIVE") data.snoozedUntil = null;
  }
  if (body?.intervalDays !== undefined) {
    const interval = Math.round(Number(body.intervalDays) || task.intervalDays);
    data.intervalDays = Math.min(Math.max(interval, 1), 3_650);
  }
  if (body?.nextDueDate !== undefined) {
    const parsed = parseDay(body.nextDueDate);
    if (parsed) data.nextDueDate = parsed;
  }
  if (typeof body?.diy === "boolean") data.diy = body.diy;
  if (body?.notes !== undefined) {
    data.notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 400) || null : null;
  }
  if (guard.canManage && body?.estimatedCostCents !== undefined) {
    data.estimatedCostCents = Math.max(Math.round(Number(body.estimatedCostCents) || 0), 0);
  }
  if (body?.equipmentId !== undefined) {
    if (body.equipmentId) {
      const equipment = await db.equipment.findFirst({
        where: { id: body.equipmentId, householdId: guard.household.id },
      });
      if (!equipment) return NextResponse.json({ error: "Unknown equipment" }, { status: 400 });
      data.equipmentId = equipment.id;
    } else {
      data.equipmentId = null;
    }
  }

  await db.maintenanceTask.update({ where: { id: task.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardPropertyRoute("MANAGE");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const task = await assertTaskInHousehold(guard.household.id, id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Archive rather than delete when there's history — the record of when the
  // water heater was last flushed is worth more than a tidy list.
  const logCount = await db.maintenanceLog.count({ where: { taskId: task.id } });
  if (logCount > 0) {
    await db.maintenanceTask.update({
      where: { id: task.id },
      data: { status: "ARCHIVED" },
    });
    return NextResponse.json({ ok: true, archived: true, logCount });
  }

  await db.maintenanceTask.delete({ where: { id: task.id } });
  return NextResponse.json({ ok: true, archived: false });
}
