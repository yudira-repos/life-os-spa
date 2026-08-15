import { db } from "@/lib/db";
import { MODULES, type ModuleId } from "@/lib/modules.config";

// The entire "licensing model" for V1: a boolean per (household, module).
// No Product/Plan/Subscription tables yet — see DESIGN.md for why that's
// deliberate. This is the ONE function every module route calls before
// rendering real content — server-side, not just to decide what the nav
// shows. Never trust the client for this check.

export async function getEntitlements(
  householdId: string
): Promise<Record<ModuleId, boolean>> {
  const rows = await db.entitlement.findMany({ where: { householdId } });
  const enabledSet = new Set(
    rows.filter((r) => r.enabled).map((r) => r.moduleId)
  );

  return Object.fromEntries(
    MODULES.map((m) => [m.id, enabledSet.has(m.id)])
  ) as Record<ModuleId, boolean>;
}

export async function isEntitled(
  householdId: string,
  moduleId: ModuleId
): Promise<boolean> {
  const row = await db.entitlement.findUnique({
    where: { householdId_moduleId: { householdId, moduleId } },
  });
  return Boolean(row?.enabled);
}

export async function seedDefaultEntitlements(householdId: string) {
  const { FREE_MODULES } = await import("@/lib/modules.config");
  // SQLite doesn't support createMany's skipDuplicates — fine here, this
  // only ever runs once, right after a household is created.
  await db.entitlement.createMany({
    data: FREE_MODULES.map((moduleId) => ({
      householdId,
      moduleId,
      enabled: true,
    })),
  });
}
