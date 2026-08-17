import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { requirePropertyAccess } from "@/lib/propertyos/authz";
import { getPrimaryProperty, conditionsOf } from "@/lib/propertyos/service";
import { TaskCard, SeedTasksButton } from "@/components/propertyos/TaskControls";
import { SyncHomeFundButton } from "@/components/propertyos/BillControls";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  TEMPLATE_BY_KEY,
  templatesFor,
  type TaskCategory,
  type TaskPriority,
} from "@/lib/propertyos/catalog";
import { dueStatus, describeDue, byUrgency, annualCostCents } from "@/lib/propertyos/schedule";
import { formatCents } from "@/lib/financialos/money";

export default async function MaintenancePage() {
  const access = await requirePropertyAccess();
  if (!access.ok) return null;
  const { household, canManage } = access;

  const property = await getPrimaryProperty(household.id);
  if (!property) {
    return (
      <Card>
        <p className="text-sm text-neutral-400">
          Add your property first — the task list is built from what the house
          actually has.
        </p>
        <Link
          href="/app/property/settings"
          className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2"
        >
          Set up the property →
        </Link>
      </Card>
    );
  }

  const [tasks, vendors] = await Promise.all([
    db.maintenanceTask.findMany({
      where: { householdId: household.id, status: { not: "ARCHIVED" } },
      orderBy: { nextDueDate: "asc" },
    }),
    db.vendor.findMany({
      where: { householdId: household.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Which adjustments applied to this house, so the UI can explain an
  // interval that differs from the catalog default.
  const adjustments = new Map(
    templatesFor(conditionsOf(property))
      .filter((entry) => entry.adjusted)
      .map((entry) => [entry.template.key, entry.adjustmentReason ?? null])
  );

  const sorted = byUrgency(tasks);
  const annualCost = tasks.reduce(
    (sum, task) => sum + annualCostCents(task.intervalDays, task.estimatedCostCents),
    0
  );

  const cards = sorted.map((task) => {
    const guidance = task.templateKey ? TEMPLATE_BY_KEY[task.templateKey] : undefined;
    return {
      id: task.id,
      name: task.name,
      category: task.category,
      categoryLabel: CATEGORY_LABELS[task.category as TaskCategory] ?? task.category,
      priority: task.priority,
      priorityLabel: PRIORITY_LABELS[task.priority as TaskPriority] ?? task.priority,
      intervalDays: task.intervalDays,
      nextDueDate: task.nextDueDate.toISOString(),
      dueDescription: describeDue(task.nextDueDate),
      status: dueStatus(task.nextDueDate, { snoozedUntil: task.snoozedUntil }),
      diy: task.diy,
      estimatedCostCents: task.estimatedCostCents,
      estimatedMinutes: task.estimatedMinutes,
      lastCompletedAt: task.lastCompletedAt?.toISOString() ?? null,
      why: guidance?.why,
      how: guidance?.how,
      notes: task.notes,
      adjustmentNote: task.templateKey ? (adjustments.get(task.templateKey) ?? null) : null,
    };
  });

  const overdue = cards.filter((card) => card.status === "OVERDUE");
  const dueSoon = cards.filter((card) => card.status === "DUE_SOON");
  const later = cards.filter(
    (card) => card.status !== "OVERDUE" && card.status !== "DUE_SOON"
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-400">
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
          {canManage && annualCost > 0 && (
            <> · about {formatCents(annualCost, { whole: true })}/year in materials and services</>
          )}
        </p>
        {canManage && <SeedTasksButton />}
      </div>

      {tasks.length === 0 && (
        <Card className="border-indigo-400/20 bg-indigo-500/5">
          <p className="font-semibold">No maintenance tasks yet.</p>
          <p className="mt-2 text-sm text-neutral-400">
            The standard list is built from what you told us about the house —
            HVAC filters, water heater flush, gutters, dryer vent, smoke alarms,
            and the smart-home items people forget entirely. Intervals adjust
            for hard water, tree cover and dusty air.
          </p>
          <div className="mt-4">
            <SeedTasksButton />
          </div>
        </Card>
      )}

      {overdue.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-300">
            Overdue
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {overdue.map((task) => (
              <TaskCard key={task.id} task={task} canManage={canManage} vendors={vendors} />
            ))}
          </div>
        </section>
      )}

      {dueSoon.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300">
            Due now
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {dueSoon.map((task) => (
              <TaskCard key={task.id} task={task} canManage={canManage} vendors={vendors} />
            ))}
          </div>
        </section>
      )}

      {later.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Scheduled
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {later.map((task) => (
              <TaskCard key={task.id} task={task} canManage={canManage} vendors={vendors} />
            ))}
          </div>
        </section>
      )}

      {canManage && tasks.length > 0 && (
        <Card>
          <p className="text-sm font-medium">Fund this properly</p>
          <p className="mt-1 text-sm text-neutral-400">
            Push this schedule and your equipment list into the FinancialOS home
            maintenance goal, so the target is built from this house rather than
            a rule of thumb.
          </p>
          <div className="mt-3">
            <SyncHomeFundButton />
          </div>
        </Card>
      )}
    </div>
  );
}
