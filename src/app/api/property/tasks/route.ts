import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPropertyRoute } from "@/lib/propertyos/authz";
import { getPrimaryProperty } from "@/lib/propertyos/service";
import { parseDay, addDays, startOfDay, today } from "@/lib/travelos/dates";
import { CATEGORY_LABELS, PRIORITY_LABELS } from "@/lib/propertyos/catalog";

const CATEGORIES = Object.keys(CATEGORY_LABELS);
const PRIORITIES = Object.keys(PRIORITY_LABELS);

export async function POST(request: Request) {
  // Creating a task is VIEW-tier: it costs nothing and anyone in the household
  // should be able to add "the gate latch is sticking" without an adult.
  const guard = await guardPropertyRoute("VIEW");
  if (!guard.ok) return guard.response;

  const property = await getPrimaryProperty(guard.household.id);
  if (!property) {
    return NextResponse.json({ error: "Add your property details first." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const intervalDays = Math.min(Math.max(intOf(body?.intervalDays, 90), 1), 3_650);

  const task = await db.maintenanceTask.create({
    data: {
      propertyId: property.id,
      householdId: guard.household.id,
      name,
      category: CATEGORIES.includes(body?.category) ? body.category : "OTHER",
      priority: PRIORITIES.includes(body?.priority) ? body.priority : "ROUTINE",
      intervalDays,
      nextDueDate: parseDay(body?.nextDueDate) ?? addDays(startOfDay(today()), 7),
      diy: body?.diy !== false,
      // Costs are manager-tier data; a viewer creating a task can't set one.
      estimatedCostCents: guard.canManage ? Math.max(intOf(body?.estimatedCostCents, 0), 0) : 0,
      estimatedMinutes: Math.max(intOf(body?.estimatedMinutes, 0), 0),
      notes: typeof body?.notes === "string" ? body.notes.trim().slice(0, 400) || null : null,
    },
  });

  return NextResponse.json({ id: task.id });
}

function intOf(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}
