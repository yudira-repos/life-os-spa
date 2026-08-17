"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { parseMoneyToCents } from "@/lib/financialos/money";

export function AddGoalFromTemplate({
  templateKey,
  label,
}: {
  templateKey: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function add() {
    setPending(true);
    await fetch("/api/financial/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateKey }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <Button
      variant="secondary"
      className="!px-3 !py-1.5 text-xs"
      disabled={pending}
      onClick={() => void add()}
    >
      {pending ? "Adding…" : (label ?? "Add this goal")}
    </Button>
  );
}

export function ContributeToGoal({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);

  async function contribute() {
    const cents = parseMoneyToCents(amount);
    if (!cents) return;
    setPending(true);
    await fetch(`/api/financial/goals/${goalId}/contribute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: cents }),
    });
    setAmount("");
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className="w-28 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-indigo-400/60"
        placeholder="$250"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Button
        variant="secondary"
        className="!px-3 !py-1.5 text-xs"
        disabled={pending || !amount}
        onClick={() => void contribute()}
      >
        {pending ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}

export function DeleteGoal({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setPending(true);
    await fetch(`/api/financial/goals/${goalId}`, { method: "DELETE" });
    setPending(false);
    router.refresh();
  }

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        className="!px-2 !py-1 text-xs text-neutral-500"
        onClick={() => setConfirming(true)}
      >
        Remove
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        className="!px-2 !py-1 text-xs text-rose-300"
        disabled={pending}
        onClick={() => void remove()}
      >
        {pending ? "Removing…" : "Confirm"}
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
