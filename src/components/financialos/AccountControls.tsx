"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseMoneyToCents } from "@/lib/financialos/money";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60";
const labelClass = "text-xs font-medium text-neutral-400";

/**
 * Manual accounts exist because not everything can be linked — an old 401(k)
 * at a provider Plaid doesn't support, a rental property, a family loan. A net
 * worth number that silently omits those is worse than no number.
 */
export function ManualAccountForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("DEPOSITORY");
  const [balance, setBalance] = useState("");
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    await fetch("/api/financial/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        balanceCents: parseMoneyToCents(balance) ?? 0,
      }),
    });
    setName("");
    setBalance("");
    setPending(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        + Add an account manually
      </Button>
    );
  }

  return (
    <Card>
      <p className="font-semibold">Add an account manually</p>
      <p className="mt-1 text-sm text-neutral-400">
        For anything that can&apos;t be linked — an old 401(k), a property, a
        loan from family. Balances are updated by hand.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={labelClass}>Account name</label>
          <input
            className={inputClass}
            placeholder="Fidelity 401(k) — old employer"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <select
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="DEPOSITORY">Cash / savings</option>
            <option value="INVESTMENT">Investment</option>
            <option value="CREDIT">Credit card</option>
            <option value="LOAN">Loan</option>
            <option value="OTHER">Other asset</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Current balance</label>
          <input
            className={inputClass}
            placeholder="$25,000"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-neutral-600">
            For credit cards and loans, enter what you owe as a positive number.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button disabled={pending || !name} onClick={() => void create()}>
          {pending ? "Adding…" : "Add account"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export function UnlinkItemButton({
  itemId,
  institutionName,
}: {
  itemId: string;
  institutionName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function unlink() {
    setPending(true);
    await fetch(`/api/financial/plaid/item/${itemId}`, { method: "DELETE" });
    setPending(false);
    router.refresh();
  }

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        className="!px-2.5 !py-1 text-xs text-neutral-500"
        onClick={() => setConfirming(true)}
      >
        Unlink
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-neutral-500">
        Removes {institutionName} and its transactions.
      </span>
      <Button
        variant="ghost"
        className="!px-2.5 !py-1 text-xs text-rose-300"
        disabled={pending}
        onClick={() => void unlink()}
      >
        {pending ? "Unlinking…" : "Confirm"}
      </Button>
      <Button
        variant="ghost"
        className="!px-2 !py-1 text-xs text-neutral-500"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
    </div>
  );
}
