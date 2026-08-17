"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseMoneyToCents, formatCents } from "@/lib/financialos/money";
import { BILL_CATEGORY_LABELS, CADENCE_LABELS } from "@/lib/propertyos/bills";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60";
const labelClass = "text-xs font-medium text-neutral-400";

export function AdoptDetectedBill({
  detected,
}: {
  detected: {
    key: string;
    suggestedName: string;
    category: string;
    typicalAmountCents: number;
    averageIntervalDays: number;
    suggestedCadence: string;
    occurrences: number;
    cadenceCertain: boolean;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function adopt() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/property/bills/adopt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: detected.key }),
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "Could not track that bill.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm text-neutral-200">
          {detected.suggestedName}
          <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-neutral-400">
            {BILL_CATEGORY_LABELS[detected.category as keyof typeof BILL_CATEGORY_LABELS] ??
              detected.category}
          </span>
          {!detected.cadenceCertain && (
            <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
              check the cadence
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">
          ~{formatCents(detected.typicalAmountCents)}{" "}
          {(CADENCE_LABELS[detected.suggestedCadence as keyof typeof CADENCE_LABELS] ?? "").toLowerCase()}{" "}
          · seen {detected.occurrences} times · about every {detected.averageIntervalDays} days
        </p>
        {error && <p className="mt-1 text-xs text-rose-300">{error}</p>}
      </div>
      <Button
        variant="secondary"
        className="!px-3 !py-1.5 text-xs"
        disabled={pending}
        onClick={() => void adopt()}
      >
        {pending ? "Adding…" : "Track this"}
      </Button>
    </div>
  );
}

export function PayBillButton({
  billId,
  typicalAmountCents,
}: {
  billId: string;
  typicalAmountCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(
    typicalAmountCents > 0 ? formatCents(typicalAmountCents) : ""
  );
  const [pending, setPending] = useState(false);
  const [jump, setJump] = useState<string | null>(null);

  async function pay() {
    const cents = parseMoneyToCents(amount);
    if (!cents) return;
    setPending(true);
    const response = await fetch(`/api/property/bills/${billId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: cents }),
    });
    const data = await response.json();
    setPending(false);
    setOpen(false);
    if (data.priceJump) {
      setJump(
        `That's ${formatCents(data.priceJump.deltaCents)} (${data.priceJump.percent}%) above this bill's own average of ${formatCents(data.priceJump.averageCents)}. Worth a look at the statement.`
      );
    }
    router.refresh();
  }

  if (jump) {
    return <p className="max-w-sm text-xs text-amber-300">{jump}</p>;
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        className="!px-3 !py-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        Record payment
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className="w-28 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-indigo-400/60"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Button
        className="!px-3 !py-1.5 text-xs"
        disabled={pending || !amount}
        onClick={() => void pay()}
      >
        {pending ? "Saving…" : "Paid"}
      </Button>
      <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

export function AddBillForm({ vendors }: { vendors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [cadence, setCadence] = useState("MONTHLY");
  const [amount, setAmount] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [autopay, setAutopay] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/property/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        category,
        cadence,
        typicalAmountCents: parseMoneyToCents(amount) ?? 0,
        nextDueDate: nextDueDate || undefined,
        vendorId: vendorId || undefined,
        autopay,
      }),
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "Could not add that bill.");
      return;
    }
    setName("");
    setAmount("");
    setNextDueDate("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        + Add a bill manually
      </Button>
    );
  }

  return (
    <Card>
      <p className="font-semibold">Add a bill</p>
      <p className="mt-1 text-sm text-neutral-400">
        For anything that isn&apos;t on a linked card — property tax, a gardener
        paid in cash, insurance inside your mortgage escrow.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Name</label>
          <input
            className={inputClass}
            placeholder="County property tax"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <select
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {Object.entries(BILL_CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>How often</label>
          <select
            className={inputClass}
            value={cadence}
            onChange={(e) => setCadence(e.target.value)}
          >
            {Object.entries(CADENCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Typical amount</label>
          <input
            className={inputClass}
            placeholder="$0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Next due</label>
          <input
            type="date"
            className={inputClass}
            value={nextDueDate}
            onChange={(e) => setNextDueDate(e.target.value)}
          />
          {category === "PROPERTY_TAX" && (
            <p className="mt-1 text-[11px] text-neutral-600">
              Leave blank to use your state&apos;s schedule.
            </p>
          )}
        </div>
        {vendors.length > 0 && (
          <div>
            <label className={labelClass}>Vendor (optional)</label>
            <select
              className={inputClass}
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">None</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={autopay}
            onChange={(e) => setAutopay(e.target.checked)}
          />
          On autopay
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      <div className="mt-4 flex items-center gap-2">
        <Button disabled={pending || !name} onClick={() => void create()}>
          {pending ? "Adding…" : "Add bill"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export function SyncHomeFundButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setPending(true);
    const response = await fetch("/api/property/costs/sync", { method: "POST" });
    const data = await response.json();
    setPending(false);
    setMessage(
      data.synced
        ? `Home maintenance goal ${data.created ? "created" : "updated"}: ${formatCents(data.targetCents, { whole: true })} target, ${formatCents(data.monthlyContributionCents)}/month.`
        : (data.reason ?? "Nothing to sync.")
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" disabled={pending} onClick={() => void sync()}>
        {pending ? "Syncing…" : "Size my home fund from this"}
      </Button>
      {message && <p className="max-w-md text-xs text-neutral-500">{message}</p>}
    </div>
  );
}
