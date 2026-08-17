import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { TransactionRow } from "@/components/financialos/TransactionRow";
import { SyncButton } from "@/components/financialos/SyncButton";
import { requireFinancialAccess, accountVisibilityWhere } from "@/lib/financialos/authz";
import { auditFinancial } from "@/lib/financialos/audit";
import { CATEGORY_BY_KEY } from "@/lib/financialos/categories";

const PAGE_SIZE = 100;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; account?: string; page?: string }>;
}) {
  const access = await requireFinancialAccess();
  if (!access.ok) return null;
  const { household, user, member, isOwner } = access;
  const scope = { memberId: member.id, isOwner };

  const params = await searchParams;
  const page = Math.max(Number(params.page ?? 1), 1);
  const categoryFilter =
    params.category && CATEGORY_BY_KEY[params.category] ? params.category : undefined;

  await auditFinancial({
    householdId: household.id,
    actorUserId: user.id,
    action: "VIEW_TRANSACTIONS",
    resource: "TRANSACTION",
    meta: { page, filtered: Boolean(categoryFilter) },
  });

  const where = {
    householdId: household.id,
    account: accountVisibilityWhere(scope),
    ...(categoryFilter ? { categoryKey: categoryFilter } : {}),
  };

  const [transactions, total] = await Promise.all([
    db.transaction.findMany({
      where,
      include: { account: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.transaction.count({ where }),
  ]);

  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-400">
          {total.toLocaleString()} transaction{total === 1 ? "" : "s"}
          {categoryFilter && ` in ${CATEGORY_BY_KEY[categoryFilter].label}`}
        </p>
        <SyncButton />
      </div>

      {categoryFilter && (
        <Link
          href="/app/financial/transactions"
          className="text-sm text-indigo-300 underline underline-offset-2"
        >
          ← Clear filter
        </Link>
      )}

      {transactions.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-400">
            No transactions yet. Link an account on the{" "}
            <Link
              href="/app/financial/accounts"
              className="text-indigo-300 underline underline-offset-2"
            >
              Accounts page
            </Link>{" "}
            and they&apos;ll appear here within a minute.
          </p>
        </Card>
      ) : (
        <>
          <Card className="divide-y divide-white/5 p-0">
            {transactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={{
                  id: transaction.id,
                  date: transaction.date.toISOString(),
                  name: transaction.name,
                  merchantName: transaction.merchantName,
                  amountCents: transaction.amountCents,
                  categoryKey: transaction.categoryKey,
                  categorySource: transaction.categorySource,
                  accountName: transaction.account.name,
                  pending: transaction.pending,
                  excludedFromCashflow: transaction.excludedFromCashflow,
                }}
              />
            ))}
          </Card>

          {pageCount > 1 && (
            <div className="flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link
                  href={`/app/financial/transactions?page=${page - 1}${categoryFilter ? `&category=${categoryFilter}` : ""}`}
                  className="text-indigo-300 underline underline-offset-2"
                >
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-neutral-500">
                Page {page} of {pageCount}
              </span>
              {page < pageCount ? (
                <Link
                  href={`/app/financial/transactions?page=${page + 1}${categoryFilter ? `&category=${categoryFilter}` : ""}`}
                  className="text-indigo-300 underline underline-offset-2"
                >
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </>
      )}

      <p className="text-xs text-neutral-600">
        Changing a category here marks it as yours — future syncs from your bank
        will never overwrite it.
      </p>
    </div>
  );
}
