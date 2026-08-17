import { db } from "@/lib/db";

// An append-only trail of who touched financial data and when.
//
// Deliberately separate from application logging, and deliberately boring:
// it records the SHAPE of an access (who, what action, which record id), never
// the CONTENT (no dollar amounts, no balances, no account numbers, no merchant
// names). That way the audit log itself never becomes a second copy of the
// sensitive data it's meant to protect — a mistake that turns a safety feature
// into a liability.
//
// Denials are logged too. A CHILD member repeatedly hitting /app/financial is
// exactly the signal this table exists to preserve.

export type FinancialAction =
  | "VIEW_OVERVIEW"
  | "VIEW_ACCOUNTS"
  | "VIEW_TRANSACTIONS"
  | "VIEW_CASHFLOW"
  | "VIEW_PLAN"
  | "VIEW_GOALS"
  | "LINK_ITEM_START"
  | "LINK_ITEM_COMPLETE"
  | "UNLINK_ITEM"
  | "SYNC_TRANSACTIONS"
  | "REFRESH_BALANCES"
  | "CREATE_ACCOUNT"
  | "UPDATE_ACCOUNT"
  | "DELETE_ACCOUNT"
  | "UPDATE_TRANSACTION"
  | "CREATE_RULE"
  | "DELETE_RULE"
  | "UPDATE_PROFILE"
  | "UPDATE_EARNER"
  | "CREATE_GOAL"
  | "UPDATE_GOAL"
  | "DELETE_GOAL"
  | "CONTRIBUTE_GOAL"
  | "CREATE_POLICY"
  | "DELETE_POLICY"
  | "GENERATE_RECOMMENDATIONS"
  | "EXPLAIN_RECOMMENDATION"
  | "ACCESS_DENIED";

export type FinancialResource =
  | "ACCOUNT"
  | "TRANSACTION"
  | "ITEM"
  | "GOAL"
  | "PROFILE"
  | "EARNER"
  | "POLICY"
  | "RULE"
  | "RECOMMENDATION"
  | "MODULE";

interface AuditInput {
  householdId: string;
  actorUserId?: string | null;
  action: FinancialAction;
  resource?: FinancialResource;
  resourceId?: string | null;
  outcome?: "OK" | "DENIED" | "ERROR";
  /** Counts and flags only. Never amounts, names, or account numbers. */
  meta?: Record<string, string | number | boolean | null>;
}

const FORBIDDEN_META_KEYS = /(amount|balance|cents|salary|account_number|mask|merchant|name)/i;

/**
 * Write an audit row. Never throws: an audit failure must not take down the
 * request it was auditing (and must not swallow the real error either — it's
 * logged to stderr instead).
 */
export async function auditFinancial(input: AuditInput): Promise<void> {
  try {
    const meta = sanitizeMeta(input.meta);

    await db.financialAuditLog.create({
      data: {
        householdId: input.householdId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        resource: input.resource ?? null,
        resourceId: input.resourceId ?? null,
        outcome: input.outcome ?? "OK",
        meta: meta ?? undefined,
      },
    });
  } catch (error) {
    console.error("[financialos] audit write failed", {
      action: input.action,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * Drop any metadata key that looks like it carries financial content. This is
 * a guard rail, not a substitute for care at the call site — but it means one
 * careless `meta: { balanceCents }` doesn't quietly defeat the whole policy.
 */
function sanitizeMeta(
  meta: AuditInput["meta"]
): Record<string, string | number | boolean | null> | null {
  if (!meta) return null;

  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (FORBIDDEN_META_KEYS.test(key)) {
      safe[key] = "[redacted]";
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

export async function getRecentAuditLog(householdId: string, limit = 50) {
  return db.financialAuditLog.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
