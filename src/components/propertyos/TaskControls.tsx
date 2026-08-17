"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseMoneyToCents, formatCents } from "@/lib/financialos/money";

export interface TaskCardData {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  priority: string;
  priorityLabel: string;
  intervalDays: number;
  nextDueDate: string;
  dueDescription: string;
  status: string;
  diy: boolean;
  estimatedCostCents: number;
  estimatedMinutes: number;
  lastCompletedAt: string | null;
  why?: string;
  how?: string[];
  notes?: string | null;
  adjustmentNote?: string | null;
}

export function TaskCard({
  task,
  canManage,
  vendors,
}: {
  task: TaskCardData;
  canManage: boolean;
  vendors: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [pending, setPending] = useState(false);
  const [cost, setCost] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const overdue = task.status === "OVERDUE";
  const dueSoon = task.status === "DUE_SOON";

  async function complete() {
    setPending(true);
    const response = await fetch(`/api/property/tasks/${task.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        costCents: canManage ? (parseMoneyToCents(cost) ?? 0) : 0,
        vendorId: vendorId || undefined,
      }),
    });
    const data = await response.json();
    setPending(false);
    setCompleting(false);
    setCost("");
    setVendorId("");
    if (response.ok) {
      setResult(`Done. Next ${data.nextDueDescription}.`);
    }
    router.refresh();
  }

  async function snooze(days: number) {
    setPending(true);
    await fetch(`/api/property/tasks/${task.id}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <Card
      className={clsx(
        "p-0",
        overdue && "border-rose-400/30",
        task.priority === "CRITICAL" && !overdue && "border-amber-400/20"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            {task.priority === "CRITICAL" && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
                {task.priorityLabel}
              </span>
            )}
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-neutral-400">
              {task.categoryLabel}
            </span>
            {!task.diy && (
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-neutral-400">
                pro job
              </span>
            )}
          </div>
          <p className="mt-2 font-medium">{task.name}</p>
          <p
            className={clsx(
              "mt-0.5 text-sm",
              overdue ? "text-rose-300" : dueSoon ? "text-amber-300" : "text-neutral-500"
            )}
          >
            {task.dueDescription}
            <span className="text-neutral-600">
              {" "}
              · every {formatInterval(task.intervalDays)}
              {task.lastCompletedAt &&
                ` · last done ${new Date(task.lastCompletedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`}
            </span>
          </p>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {!completing && (
            <>
              <Button
                variant="secondary"
                className="!px-3 !py-1.5 text-xs"
                disabled={pending}
                onClick={() => setCompleting(true)}
              >
                Mark done
              </Button>
              <Button
                variant="ghost"
                className="!px-2 !py-1 text-xs text-neutral-500"
                disabled={pending}
                onClick={() => void snooze(14)}
              >
                Snooze
              </Button>
            </>
          )}
        </div>
      </div>

      {completing && (
        <div className="border-t border-white/5 px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            {canManage && (
              <div>
                <label className="text-xs font-medium text-neutral-400">
                  What did it cost?
                </label>
                <input
                  className="mt-1 w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60"
                  placeholder="$0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
            )}
            {vendors.length > 0 && (
              <div>
                <label className="text-xs font-medium text-neutral-400">Who did it?</label>
                <select
                  className="mt-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60"
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                >
                  <option value="">We did</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button className="!px-3 !py-2 text-xs" disabled={pending} onClick={() => void complete()}>
              {pending ? "Saving…" : "Log it"}
            </Button>
            <Button
              variant="ghost"
              className="!px-2 !py-2 text-xs"
              onClick={() => setCompleting(false)}
            >
              Cancel
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-neutral-600">
            The next one is scheduled from today, not from the original due date
            — so being late doesn&apos;t leave it permanently overdue.
          </p>
        </div>
      )}

      {result && (
        <p className="border-t border-white/5 px-5 py-2 text-xs text-emerald-300">{result}</p>
      )}

      {open && (
        <div className="border-t border-white/5 px-5 py-4">
          {task.why && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Why it matters
              </h4>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-300">{task.why}</p>
            </div>
          )}

          {task.how && task.how.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                How
              </h4>
              <ul className="mt-1.5 space-y-1.5 text-sm text-neutral-400">
                {task.how.map((step, index) => (
                  <li key={index}>• {step}</li>
                ))}
              </ul>
            </div>
          )}

          {task.adjustmentNote && (
            <p className="mt-4 rounded-lg border border-indigo-400/20 bg-indigo-500/5 p-3 text-xs text-indigo-200">
              {task.adjustmentNote}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
            {task.estimatedMinutes > 0 && <span>About {task.estimatedMinutes} minutes</span>}
            {canManage && task.estimatedCostCents > 0 && (
              <span>Around {formatCents(task.estimatedCostCents)} each time</span>
            )}
          </div>

          {task.notes && <p className="mt-3 text-sm text-neutral-400">{task.notes}</p>}
        </div>
      )}
    </Card>
  );
}

function formatInterval(days: number): string {
  if (days <= 10) return `${days} days`;
  if (days <= 45) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30.44)} months`;
  const years = days / 365.25;
  return years === 1 ? "year" : `${years.toFixed(0)} years`;
}

export function SeedTasksButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setPending(true);
    const response = await fetch("/api/property/tasks/seed", { method: "POST" });
    const data = await response.json();
    setPending(false);
    setMessage(
      data.note ?? (response.ok ? `Added ${data.created} tasks.` : (data.error ?? "Failed."))
    );
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" disabled={pending} onClick={() => void run()}>
        {pending ? "Adding…" : "Add the standard task list"}
      </Button>
      {message && <span className="text-xs text-neutral-500">{message}</span>}
    </div>
  );
}
