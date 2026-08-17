"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { formatCents } from "@/lib/financialos/money";
import { categoriesByGroup, categoryEmoji } from "@/lib/financialos/categories";

export interface TransactionRowData {
  id: string;
  date: string;
  name: string;
  merchantName: string | null;
  amountCents: number;
  categoryKey: string;
  categorySource: string;
  accountName: string;
  pending: boolean;
  excludedFromCashflow: boolean;
}

export function TransactionRow({ transaction }: { transaction: TransactionRowData }) {
  const router = useRouter();
  const [categoryKey, setCategoryKey] = useState(transaction.categoryKey);
  const [pending, setPending] = useState(false);
  const groups = categoriesByGroup();

  async function updateCategory(next: string) {
    setCategoryKey(next);
    setPending(true);
    await fetch(`/api/financial/transactions/${transaction.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryKey: next }),
    });
    setPending(false);
    router.refresh();
  }

  const inflow = transaction.amountCents > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <span className="w-20 shrink-0 text-xs tabular-nums text-neutral-500">
        {new Date(transaction.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-neutral-200">
          {transaction.merchantName ?? transaction.name}
          {transaction.pending && (
            <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
              pending
            </span>
          )}
          {transaction.excludedFromCashflow && (
            <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-neutral-500">
              excluded
            </span>
          )}
        </p>
        <p className="truncate text-xs text-neutral-600">{transaction.accountName}</p>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-sm">{categoryEmoji(categoryKey)}</span>
        <select
          className={clsx(
            "max-w-[11rem] rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-indigo-400/60",
            pending && "opacity-50"
          )}
          value={categoryKey}
          disabled={pending}
          onChange={(e) => void updateCategory(e.target.value)}
        >
          {groups.map((group) => (
            <optgroup key={group.group} label={group.label}>
              {group.items.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {transaction.categorySource === "USER" && (
          <span
            title="You set this category. Syncs will never overwrite it."
            className="text-[10px] text-emerald-400"
          >
            ✓
          </span>
        )}
      </div>

      <span
        className={clsx(
          "w-28 shrink-0 text-right tabular-nums",
          inflow ? "text-emerald-300" : "text-neutral-200"
        )}
      >
        {inflow ? "+" : ""}
        {formatCents(transaction.amountCents)}
      </span>
    </div>
  );
}
