import { db } from "@/lib/db";
import { addDays, startOfDay, today, daysBetween } from "@/lib/travelos/dates";
import {
  templatesFor,
  TEMPLATE_BY_KEY,
  type PropertyConditions,
} from "@/lib/propertyos/catalog";
import {
  initialDueDate,
  dueStatus,
  annualCostCents,
  byUrgency,
  type DueStatus,
} from "@/lib/propertyos/schedule";
import {
  annualBillCents,
  billStatus,
  nextTaxDeadline,
  estimatedAnnualTaxCents,
  type Cadence,
} from "@/lib/propertyos/bills";
import { annualDepreciationCents } from "@/lib/propertyos/equipment";
import type { Property } from "@/generated/prisma/client";

// Database orchestration. The engines (catalog, schedule, bills, equipment)
// stay pure so they can be tested without a database; this is where they meet
// Prisma.

export function conditionsOf(property: Property): PropertyConditions {
  return {
    hasWaterSoftener: property.hasWaterSoftener,
    hasIrrigation: property.hasIrrigation,
    hasPool: property.hasPool,
    hasSepticTank: property.hasSepticTank,
    hasFireplace: property.hasFireplace,
    hardWater: property.hardWater,
    dustyOrSmoky: property.dustyOrSmoky,
    heavyTreeCover: property.heavyTreeCover,
  };
}

/**
 * Create the maintenance tasks that apply to this house.
 *
 * Idempotent by template key — re-running after changing a property's
 * conditions adds the newly-applicable tasks (you installed a softener)
 * without duplicating or resetting the ones already being tracked.
 */
export async function seedMaintenanceTasks(
  householdId: string,
  propertyId: string
): Promise<{ created: number; skipped: number }> {
  const property = await db.property.findFirst({
    where: { id: propertyId, householdId },
  });
  if (!property) return { created: 0, skipped: 0 };

  const existing = await db.maintenanceTask.findMany({
    where: { propertyId },
    select: { templateKey: true },
  });
  const have = new Set(existing.map((task) => task.templateKey).filter(Boolean));

  const applicable = templatesFor(conditionsOf(property));
  let created = 0;
  let skipped = 0;

  for (const { template, intervalDays } of applicable) {
    if (have.has(template.key)) {
      skipped += 1;
      continue;
    }

    await db.maintenanceTask.create({
      data: {
        propertyId,
        householdId,
        templateKey: template.key,
        name: template.name,
        category: template.category,
        priority: template.priority,
        intervalDays,
        seasonalMonths: template.seasonalMonths?.join(",") ?? null,
        diy: template.diy,
        estimatedCostCents: template.estimatedCostCents,
        estimatedMinutes: template.estimatedMinutes,
        nextDueDate: initialDueDate({
          key: template.key,
          intervalDays,
          seasonalMonths: template.seasonalMonths,
        }),
      },
    });
    created += 1;
  }

  return { created, skipped };
}

export async function getPrimaryProperty(householdId: string) {
  return db.property.findFirst({
    where: { householdId },
    orderBy: { createdAt: "asc" },
  });
}

// --- Dashboard --------------------------------------------------------------

export interface DashboardItem {
  kind: "BILL" | "TASK";
  id: string;
  name: string;
  detail: string;
  dueDate: Date;
  status: DueStatus | "OVERDUE" | "DUE_SOON" | "UPCOMING" | "SCHEDULED";
  amountCents?: number;
  priority?: string;
  category: string;
}

export interface PropertyDashboard {
  property: Property | null;
  overdue: DashboardItem[];
  dueSoon: DashboardItem[];
  upcoming: DashboardItem[];
  counts: { bills: number; tasks: number; vendors: number; equipment: number };
  costs: {
    annualBillsCents: number;
    annualMaintenanceCents: number;
    annualReserveCents: number;
    annualTotalCents: number;
    monthlyTotalCents: number;
    estimatedTaxCents: number | null;
  };
  nextTaxDeadline: { date: Date; label: string; dueDate: Date } | null;
  /** Only populated for managers — cost data is manager-tier. */
  includesCosts: boolean;
}

export async function buildDashboard(
  householdId: string,
  options: { includeCosts: boolean; now?: Date } = { includeCosts: true }
): Promise<PropertyDashboard> {
  const now = startOfDay(options.now ?? today());
  const horizon = addDays(now, 45);

  const property = await getPrimaryProperty(householdId);

  const [bills, tasks, vendorCount, equipment] = await Promise.all([
    options.includeCosts
      ? db.propertyBill.findMany({
          where: { householdId, status: "ACTIVE" },
          orderBy: { nextDueDate: "asc" },
        })
      : Promise.resolve([]),
    db.maintenanceTask.findMany({
      where: { householdId, status: { in: ["ACTIVE", "SNOOZED"] } },
      orderBy: { nextDueDate: "asc" },
    }),
    db.vendor.count({ where: { householdId } }),
    db.equipment.findMany({
      where: { householdId },
      select: { kind: true, expectedLifeYears: true },
    }),
  ]);

  const items: DashboardItem[] = [];

  for (const bill of bills) {
    if (!bill.nextDueDate) continue;
    const status = billStatus(bill.nextDueDate, bill.status, now);
    if (status === "PAUSED") continue;
    if (bill.nextDueDate > horizon) continue;

    items.push({
      kind: "BILL",
      id: bill.id,
      name: bill.name,
      detail: bill.autopay ? "On autopay" : "Needs paying",
      dueDate: bill.nextDueDate,
      status,
      amountCents: bill.typicalAmountCents,
      category: bill.category,
    });
  }

  for (const task of tasks) {
    const status = dueStatus(task.nextDueDate, {
      snoozedUntil: task.snoozedUntil,
      now,
    });
    if (status === "SNOOZED") continue;
    if (task.nextDueDate > horizon) continue;

    items.push({
      kind: "TASK",
      id: task.id,
      name: task.name,
      detail: task.diy ? "You can do this" : "Needs a professional",
      dueDate: task.nextDueDate,
      status,
      priority: task.priority,
      category: task.category,
    });
  }

  const sorted = byUrgency(
    items.map((item) => ({ ...item, nextDueDate: item.dueDate })),
    now
  );

  const annualBillsCents = bills.reduce(
    (sum, bill) => sum + annualBillCents(bill.cadence as Cadence, bill.typicalAmountCents),
    0
  );
  const annualMaintenanceCents = tasks.reduce(
    (sum, task) => sum + annualCostCents(task.intervalDays, task.estimatedCostCents),
    0
  );
  const annualReserveCents = annualDepreciationCents(equipment);

  const estimatedTaxCents = property
    ? estimatedAnnualTaxCents(property.assessedValueCents, property.taxRatePercent)
    : null;

  const annualTotalCents = annualBillsCents + annualMaintenanceCents + annualReserveCents;

  return {
    property,
    overdue: sorted.filter((item) => item.status === "OVERDUE"),
    dueSoon: sorted.filter((item) => item.status === "DUE_SOON"),
    upcoming: sorted.filter((item) => item.status === "UPCOMING"),
    counts: {
      bills: bills.length,
      tasks: tasks.length,
      vendors: vendorCount,
      equipment: equipment.length,
    },
    costs: {
      annualBillsCents,
      annualMaintenanceCents,
      annualReserveCents,
      annualTotalCents,
      monthlyTotalCents: Math.round(annualTotalCents / 12),
      estimatedTaxCents,
    },
    nextTaxDeadline: property ? nextTaxDeadline(property.stateCode, now) : null,
    includesCosts: options.includeCosts,
  };
}

/** Everything a task's card needs, including the catalog's guidance. */
export function taskGuidance(templateKey: string | null) {
  if (!templateKey) return null;
  const template = TEMPLATE_BY_KEY[templateKey];
  if (!template) return null;
  return { why: template.why, how: template.how ?? [] };
}

/** Recent spend on the house, from logged maintenance and bill payments. */
export async function actualSpend(
  householdId: string,
  months = 12
): Promise<{ maintenanceCents: number; billsCents: number; totalCents: number }> {
  const since = addDays(startOfDay(today()), -Math.round(months * 30.44));

  const [logs, payments] = await Promise.all([
    db.maintenanceLog.findMany({
      where: { completedAt: { gte: since }, task: { householdId } },
      select: { costCents: true },
    }),
    db.billPayment.findMany({
      where: { paidOn: { gte: since }, bill: { householdId } },
      select: { amountCents: true },
    }),
  ]);

  const maintenanceCents = logs.reduce((sum, log) => sum + log.costCents, 0);
  const billsCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);

  return { maintenanceCents, billsCents, totalCents: maintenanceCents + billsCents };
}

/** Days since a vendor was last used — for the "who did this last time" view. */
export function daysSince(date: Date | null, now?: Date): number | null {
  if (!date) return null;
  return daysBetween(date, startOfDay(now ?? today()));
}
