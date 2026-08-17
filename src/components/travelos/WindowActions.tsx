"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RegenerateWindowsButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/travel/windows", { method: "POST" });
    const data = await response.json();
    setPending(false);
    setMessage(
      data.note ??
        (response.ok
          ? `${data.windowCount} window${data.windowCount === 1 ? "" : "s"} found.`
          : (data.error ?? "Failed."))
    );
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" disabled={pending} onClick={() => void run()}>
        {pending ? "Recalculating…" : "Recalculate windows"}
      </Button>
      {message && <span className="text-xs text-neutral-500">{message}</span>}
    </div>
  );
}

export function WindowStatusButtons({
  windowId,
  status,
}: {
  windowId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function setStatus(next: string) {
    setPending(true);
    await fetch(`/api/travel/windows/${windowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setPending(false);
    router.refresh();
  }

  if (status === "CONFIRMED") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] text-emerald-300">
        Trip planned
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {status !== "SHORTLISTED" && (
        <Button
          variant="ghost"
          className="!px-2.5 !py-1 text-xs"
          disabled={pending}
          onClick={() => void setStatus("SHORTLISTED")}
        >
          Shortlist
        </Button>
      )}
      {status === "SHORTLISTED" && (
        <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-[11px] text-indigo-300">
          Shortlisted
        </span>
      )}
      <Button
        variant="ghost"
        className="!px-2 !py-1 text-xs text-neutral-500"
        disabled={pending}
        onClick={() => void setStatus("DISMISSED")}
      >
        Dismiss
      </Button>
    </div>
  );
}

export function FindFlightsButton({ windowId }: { windowId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setPending(true);
    setMessage(null);
    setError(null);

    const response = await fetch(`/api/travel/windows/${windowId}/flights`, {
      method: "POST",
    });
    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setError(data.error ?? "Flight search failed.");
      return;
    }
    setMessage(data.note ?? `${data.options} options found across ${data.searched} destinations.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button disabled={pending} onClick={() => void search()}>
        {pending ? "Checking fares…" : "Find flight options"}
      </Button>
      {message && <p className="text-xs text-neutral-500">{message}</p>}
      {error && <p className="max-w-lg text-xs text-rose-300">{error}</p>}
    </div>
  );
}

export function ConfirmTripButton({
  windowId,
  destinationCode,
  destinationName,
  flightOptionId,
}: {
  windowId: string;
  destinationCode: string;
  destinationName: string;
  flightOptionId?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);

    const response = await fetch(`/api/travel/windows/${windowId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationCode, flightOptionId }),
    });
    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setError(data.error ?? "Could not confirm.");
      return;
    }

    const total = (data.estimatedCostCents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

    setResult(
      data.savingsGoal
        ? `Trip saved. Estimated ${total} — a vacation savings goal was created for ${(data.savingsGoal.monthlyContributionCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}/month over ${data.savingsGoal.monthsRemaining} months.`
        : `Trip saved. Estimated ${total}.`
    );
    router.refresh();
  }

  if (result) return <p className="text-xs text-emerald-300">{result}</p>;

  if (!confirming) {
    return (
      <Button
        variant="secondary"
        className="!px-3 !py-1.5 text-xs"
        onClick={() => setConfirming(true)}
      >
        Plan this trip
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-400">
        This saves {destinationName} as a planned trip and, if FinancialOS is
        on, creates a vacation savings goal with a deadline a month before you
        fly. It does not book anything.
      </p>
      <div className="flex items-center gap-2">
        <Button
          className="!px-3 !py-1.5 text-xs"
          disabled={pending}
          onClick={() => void confirm()}
        >
          {pending ? "Saving…" : "Confirm"}
        </Button>
        <Button
          variant="ghost"
          className="!px-2 !py-1 text-xs"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
