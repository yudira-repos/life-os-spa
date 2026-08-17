"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SyncButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/financial/plaid/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Sync failed.");
      } else {
        const added = (data.results ?? []).reduce(
          (sum: number, r: { transactions: { added: number } }) => sum + r.transactions.added,
          0
        );
        setMessage(added > 0 ? `${added} transactions updated.` : "Already up to date.");
      }
    } catch {
      setMessage("Sync failed.");
    } finally {
      setPending(false);
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" disabled={pending} onClick={() => void sync()}>
        {pending ? "Syncing…" : "Sync now"}
      </Button>
      {message && <span className="text-xs text-neutral-500">{message}</span>}
    </div>
  );
}
