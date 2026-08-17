import { db } from "@/lib/db";
import { dollarsToCents } from "@/lib/financialos/money";
import { decryptSecret } from "@/lib/financialos/crypto";
import { categorize, loadRules } from "@/lib/financialos/categorize";
import {
  fetchAccounts,
  syncTransactions,
  itemStatusFromError,
  type AccountBase,
  type PlaidTransaction,
} from "@/lib/financialos/plaid";
import type { PlaidItem } from "@/generated/prisma/client";

// Turning Plaid's view of the world into ours. Three things happen here that
// are easy to get wrong and expensive to get wrong quietly:
//
//   SIGN. Plaid reports a $50 grocery charge as amount: +50 (money leaving a
//   depository account) and a paycheck as amount: -2000. That's the opposite
//   of how a person reads a ledger. We flip it exactly once, here, so that
//   everywhere else in the codebase positive means money in. Every downstream
//   sum depends on this being done once and only once.
//
//   IDEMPOTENCE. Sync runs on a webhook, on a button press, and on page load.
//   Every write is an upsert keyed on plaid_transaction_id, so running it
//   twice does nothing the second time.
//
//   REMOVALS. Plaid removes transactions that were reversed or never posted.
//   If you ignore the removed[] array, a household keeps seeing spending that
//   didn't happen.

const PLAID_ACCOUNT_TYPE_MAP: Record<string, string> = {
  depository: "DEPOSITORY",
  credit: "CREDIT",
  loan: "LOAN",
  investment: "INVESTMENT",
  brokerage: "INVESTMENT",
  other: "OTHER",
};

export function accessTokenFor(item: Pick<PlaidItem, "accessTokenEnc">): string {
  return decryptSecret(item.accessTokenEnc);
}

/**
 * Plaid balances are signed from the institution's perspective: a credit card
 * with $1,200 owed reports current: 1200. In net-worth terms that's a
 * liability, so we store it negative and every consumer can just add.
 */
function normalizeBalanceCents(account: AccountBase): number {
  const raw = account.balances.current ?? 0;
  const cents = dollarsToCents(raw);
  const type = account.type as string;
  const isLiability = type === "credit" || type === "loan";
  return isLiability ? -Math.abs(cents) : cents;
}

export async function upsertAccounts(
  householdId: string,
  itemId: string,
  accounts: AccountBase[]
): Promise<number> {
  for (const account of accounts) {
    const type = PLAID_ACCOUNT_TYPE_MAP[account.type as string] ?? "OTHER";

    await db.financialAccount.upsert({
      where: { plaidAccountId: account.account_id },
      create: {
        householdId,
        plaidItemId: itemId,
        plaidAccountId: account.account_id,
        name: account.name,
        officialName: account.official_name ?? null,
        mask: account.mask ?? null, // last 4 only — Plaid never sends more
        type,
        subtype: (account.subtype as string) ?? null,
        currentBalanceCents: normalizeBalanceCents(account),
        availableBalanceCents:
          account.balances.available != null
            ? dollarsToCents(account.balances.available)
            : null,
        limitCents:
          account.balances.limit != null ? dollarsToCents(account.balances.limit) : null,
        isoCurrency: account.balances.iso_currency_code ?? "USD",
        lastRefreshedAt: new Date(),
      },
      update: {
        name: account.name,
        officialName: account.official_name ?? null,
        currentBalanceCents: normalizeBalanceCents(account),
        availableBalanceCents:
          account.balances.available != null
            ? dollarsToCents(account.balances.available)
            : null,
        limitCents:
          account.balances.limit != null ? dollarsToCents(account.balances.limit) : null,
        lastRefreshedAt: new Date(),
      },
    });
  }
  return accounts.length;
}

interface UpsertTransactionsResult {
  added: number;
  modified: number;
  removed: number;
  skipped: number;
}

async function upsertTransactions(
  householdId: string,
  transactions: PlaidTransaction[],
  rules: Awaited<ReturnType<typeof loadRules>>
): Promise<{ written: number; skipped: number }> {
  let written = 0;
  let skipped = 0;

  // Map Plaid account ids to our internal ids once, rather than per row.
  const accounts = await db.financialAccount.findMany({
    where: { householdId, plaidAccountId: { not: null } },
    select: { id: true, plaidAccountId: true },
  });
  const accountIdByPlaidId = new Map(
    accounts.map((a) => [a.plaidAccountId as string, a.id])
  );

  for (const transaction of transactions) {
    const accountId = accountIdByPlaidId.get(transaction.account_id);
    if (!accountId) {
      // The account arrives in the same sync payload, so this only happens if
      // an account was filtered out or removed. Skip rather than orphan a row.
      skipped += 1;
      continue;
    }

    // THE SIGN FLIP. See the note at the top of this file.
    const amountCents = -dollarsToCents(transaction.amount);

    const pfcPrimary = transaction.personal_finance_category?.primary ?? null;
    const pfcDetailed = transaction.personal_finance_category?.detailed ?? null;

    const categorization = categorize(
      {
        name: transaction.name,
        merchantName: transaction.merchant_name ?? null,
        amountCents,
        plaidPrimary: pfcPrimary,
        plaidDetailed: pfcDetailed,
      },
      rules
    );

    const existing = await db.transaction.findUnique({
      where: { plaidTransactionId: transaction.transaction_id },
      select: { id: true, categorySource: true },
    });

    // A hand-corrected category survives every future sync.
    const preserveUserCategory = existing?.categorySource === "USER";

    const common = {
      date: new Date(transaction.date),
      authorizedDate: transaction.authorized_date
        ? new Date(transaction.authorized_date)
        : null,
      name: transaction.name,
      merchantName: transaction.merchant_name ?? null,
      amountCents,
      isoCurrency: transaction.iso_currency_code ?? "USD",
      pending: transaction.pending ?? false,
      plaidPfcPrimary: pfcPrimary,
      plaidPfcDetailed: pfcDetailed,
    };

    await db.transaction.upsert({
      where: { plaidTransactionId: transaction.transaction_id },
      create: {
        householdId,
        accountId,
        plaidTransactionId: transaction.transaction_id,
        ...common,
        categoryKey: categorization.categoryKey,
        categorySource: categorization.categorySource,
        isTransfer: categorization.isTransfer,
      },
      update: preserveUserCategory
        ? common
        : {
            ...common,
            categoryKey: categorization.categoryKey,
            categorySource: categorization.categorySource,
            isTransfer: categorization.isTransfer,
          },
    });
    written += 1;
  }

  return { written, skipped };
}

export interface SyncResult {
  itemId: string;
  status: string;
  accounts: number;
  transactions: UpsertTransactionsResult;
  error?: string;
}

/** Sync one Plaid Item: accounts, then transactions, then advance the cursor. */
export async function syncItem(item: PlaidItem): Promise<SyncResult> {
  const result: SyncResult = {
    itemId: item.id,
    status: item.status,
    accounts: 0,
    transactions: { added: 0, modified: 0, removed: 0, skipped: 0 },
  };

  let accessToken: string;
  try {
    accessToken = accessTokenFor(item);
  } catch (error) {
    result.status = "ERROR";
    result.error =
      error instanceof Error ? error.message : "Could not decrypt access token";
    return result;
  }

  try {
    const balances = await fetchAccounts(accessToken);
    result.accounts = await upsertAccounts(item.householdId, item.id, balances);

    const page = await syncTransactions(accessToken, item.cursor);
    const rules = await loadRules(item.householdId);

    const added = await upsertTransactions(item.householdId, page.added, rules);
    const modified = await upsertTransactions(item.householdId, page.modified, rules);

    let removed = 0;
    if (page.removed.length > 0) {
      const deletion = await db.transaction.deleteMany({
        where: {
          householdId: item.householdId,
          plaidTransactionId: { in: page.removed.map((r) => r.transaction_id) },
        },
      });
      removed = deletion.count;
    }

    result.transactions = {
      added: added.written,
      modified: modified.written,
      removed,
      skipped: added.skipped + modified.skipped,
    };

    // Advance the cursor only after every write above succeeded. If anything
    // threw, we keep the old cursor and re-fetch the same window next time —
    // duplicate work is fine (the upserts are idempotent), lost transactions
    // are not.
    await db.plaidItem.update({
      where: { id: item.id },
      data: {
        cursor: page.cursor,
        lastSyncedAt: new Date(),
        status: "GOOD",
        statusDetail: null,
      },
    });
    result.status = "GOOD";
  } catch (error) {
    const { status, detail } = itemStatusFromError(error);
    await db.plaidItem.update({
      where: { id: item.id },
      data: { status, statusDetail: detail },
    });
    result.status = status;
    result.error = detail;
  }

  return result;
}

/** Sync every Item in a household. Failures are per-item, never fatal. */
export async function syncHousehold(householdId: string): Promise<SyncResult[]> {
  const items = await db.plaidItem.findMany({
    where: { householdId, status: { notIn: ["REVOKED"] } },
  });

  const results: SyncResult[] = [];
  for (const item of items) {
    results.push(await syncItem(item));
  }
  return results;
}

/** True when it's been long enough that a page load should trigger a sync. */
export function shouldAutoSync(lastSyncedAt: Date | null, minutes = 60): boolean {
  if (!lastSyncedAt) return true;
  return Date.now() - lastSyncedAt.getTime() > minutes * 60_000;
}
