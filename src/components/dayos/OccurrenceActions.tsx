"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";

interface AssigneeOption {
  key: string;
  name: string;
  external: boolean;
}

export function ConfirmButtons({
  occurrenceId,
  state,
  canRespond,
}: {
  occurrenceId: string;
  state: string;
  canRespond: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (!canRespond) return null;
  if (state === "CONFIRMED") {
    return <span className="text-xs text-emerald-400">Confirmed</span>;
  }

  const respond = (response: "CONFIRM" | "DECLINE") => {
    startTransition(async () => {
      const res = await fetch(`/api/day/occurrences/${occurrenceId}/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const body = await res.json();
      setMessage(res.ok ? body.next : body.error);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => respond("CONFIRM")}
        className="rounded-lg bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
      >
        I&apos;ve got it
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => respond("DECLINE")}
        className="rounded-lg bg-white/5 px-3 py-1 text-xs font-medium text-neutral-300 hover:bg-white/10 disabled:opacity-50"
      >
        Can&apos;t do it
      </button>
      {message && <span className="text-xs text-neutral-500">{message}</span>}
    </div>
  );
}

export function ReassignControl({
  occurrenceId,
  current,
  options,
}: {
  occurrenceId: string;
  current: string | null;
  options: AssigneeOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const assign = (assignee: string) => {
    startTransition(async () => {
      const res = await fetch(`/api/day/occurrences/${occurrenceId}/assign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignee: assignee || null }),
      });
      const body = await res.json();
      setNote(res.ok ? body.note : body.error);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={current ?? ""}
        disabled={pending}
        onChange={(event) => assign(event.target.value)}
        className="rounded-lg border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 disabled:opacity-50"
      >
        <option value="">Nobody assigned</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.name}
            {option.external ? " (carpool)" : ""}
          </option>
        ))}
      </select>
      {note && <span className="text-xs text-neutral-500">{note}</span>}
    </div>
  );
}

export function RecalculateButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await fetch("/api/day/plan", { method: "POST" });
            const body = await res.json();
            setResult(
              res.ok
                ? (body.note ?? `Planned ${body.days} days · travel times ${body.routing}`)
                : body.error
            );
            router.refresh();
          })
        }
        className={clsx(
          "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
          "bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 disabled:opacity-50"
        )}
      >
        {pending ? "Recalculating…" : "Recalculate the week"}
      </button>
      {result && <span className="text-xs text-neutral-500">{result}</span>}
    </div>
  );
}
