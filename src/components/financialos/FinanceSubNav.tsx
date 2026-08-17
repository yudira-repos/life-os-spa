"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const TABS = [
  { href: "/app/financial", label: "Overview" },
  { href: "/app/financial/accounts", label: "Accounts" },
  { href: "/app/financial/transactions", label: "Transactions" },
  { href: "/app/financial/cashflow", label: "Cashflow" },
  { href: "/app/financial/plan", label: "Your plan" },
  { href: "/app/financial/goals", label: "Goals" },
  { href: "/app/financial/learn", label: "Learn" },
  { href: "/app/financial/setup", label: "Setup" },
];

export function FinanceSubNav() {
  const pathname = usePathname();
  const base = "/app/financial";

  return (
    <div className="mb-6">
      <p className="text-2xl font-semibold tracking-tight">FinancialOS</p>
      <p className="mt-1 text-sm text-neutral-400">
        Accounts, cashflow, and a plan that shows its work.
      </p>
      <nav className="mt-4 flex flex-wrap gap-1 border-b border-white/10 pb-px">
        {TABS.map((tab) => {
          const active =
            tab.href === base ? pathname === base : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "rounded-t-lg px-3.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-b-2 border-indigo-400 text-indigo-300"
                  : "text-neutral-400 hover:text-neutral-100"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
