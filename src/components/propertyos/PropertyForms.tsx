"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseMoneyToCents, formatCents } from "@/lib/financialos/money";
import { STATE_TOP_MARGINAL_RATE } from "@/lib/financialos/constants";
import { TRADE_LABELS, EQUIPMENT_KINDS, type VendorTrade } from "@/lib/propertyos/equipment";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60";
const labelClass = "text-xs font-medium text-neutral-400";

export interface PropertyValues {
  name: string;
  addressLine: string;
  city: string;
  stateCode: string;
  postalCode: string;
  propertyType: string;
  yearBuilt: number | null;
  squareFeet: number | null;
  assessedValueDollars: number;
  taxRatePercent: number;
  hasWaterSoftener: boolean;
  hasIrrigation: boolean;
  hasPool: boolean;
  hasSepticTank: boolean;
  hasFireplace: boolean;
  hardWater: boolean;
  dustyOrSmoky: boolean;
  heavyTreeCover: boolean;
}

const CONDITION_FIELDS: { key: keyof PropertyValues; label: string; hint: string }[] = [
  { key: "hasWaterSoftener", label: "Water softener", hint: "Adds the salt refill schedule." },
  { key: "hardWater", label: "Hard water", hint: "Shortens softener, filter and water heater intervals." },
  { key: "hasIrrigation", label: "Irrigation system", hint: "Adds seasonal timer checks." },
  { key: "hasPool", label: "Pool", hint: "Adds weekly chemistry servicing." },
  { key: "hasSepticTank", label: "Septic tank", hint: "Adds the 3-year pump-out." },
  { key: "hasFireplace", label: "Fireplace / chimney", hint: "Adds the annual sweep before winter." },
  { key: "heavyTreeCover", label: "Trees over the house", hint: "Doubles gutter cleaning; adds tree trimming." },
  { key: "dustyOrSmoky", label: "Dust or wildfire smoke", hint: "Halves the air filter interval." },
];

export function PropertyForm({ initial }: { initial: PropertyValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [assessed, setAssessed] = useState(
    initial.assessedValueDollars ? formatCents(initial.assessedValueDollars * 100, { whole: true }) : ""
  );
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof PropertyValues>(key: K, value: PropertyValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/property/property", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        assessedValueCents: parseMoneyToCents(assessed) ?? 0,
      }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    setResult(
      data.tasksAdded > 0
        ? `Saved. ${data.tasksAdded} maintenance ${data.tasksAdded === 1 ? "task" : "tasks"} added for this house.`
        : "Saved."
    );
    router.refresh();
  }

  const states = Object.keys(STATE_TOP_MARGINAL_RATE).sort();

  return (
    <Card>
      <p className="font-semibold">Your property</p>
      <p className="mt-1 text-sm text-neutral-400">
        The checkboxes matter more than the address — they decide which
        maintenance tasks apply and how often.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Name</label>
          <input
            className={inputClass}
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <select
            className={inputClass}
            value={values.propertyType}
            onChange={(e) => set("propertyType", e.target.value)}
          >
            <option value="SINGLE_FAMILY">Single family</option>
            <option value="CONDO">Condo</option>
            <option value="TOWNHOME">Townhome</option>
            <option value="MULTI_FAMILY">Multi-family</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Address</label>
          <input
            className={inputClass}
            value={values.addressLine}
            onChange={(e) => set("addressLine", e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>City</label>
          <input
            className={inputClass}
            value={values.city}
            onChange={(e) => set("city", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>State</label>
            <select
              className={inputClass}
              value={values.stateCode}
              onChange={(e) => set("stateCode", e.target.value)}
            >
              {states.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>ZIP</label>
            <input
              className={inputClass}
              value={values.postalCode}
              onChange={(e) => set("postalCode", e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Year built</label>
          <input
            type="number"
            className={inputClass}
            value={values.yearBuilt ?? ""}
            onChange={(e) => set("yearBuilt", Number(e.target.value) || null)}
          />
        </div>
        <div>
          <label className={labelClass}>Square feet</label>
          <input
            type="number"
            className={inputClass}
            value={values.squareFeet ?? ""}
            onChange={(e) => set("squareFeet", Number(e.target.value) || null)}
          />
        </div>
        <div>
          <label className={labelClass}>Assessed value</label>
          <input
            className={inputClass}
            placeholder="$0"
            value={assessed}
            onChange={(e) => {
              setAssessed(e.target.value);
              setResult(null);
            }}
          />
        </div>
        <div>
          <label className={labelClass}>Effective tax rate (%)</label>
          <input
            type="number"
            step="0.01"
            className={inputClass}
            placeholder="1.25"
            value={values.taxRatePercent || ""}
            onChange={(e) => set("taxRatePercent", Number(e.target.value) || 0)}
          />
          <p className="mt-1 text-[11px] text-neutral-600">
            Used only to estimate the annual bill when you haven&apos;t entered one.
          </p>
        </div>
      </div>

      <div className="mt-6 border-t border-white/5 pt-5">
        <p className="text-sm font-medium text-neutral-200">What does this house have?</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {CONDITION_FIELDS.map((field) => (
            <label key={String(field.key)} className="flex items-start gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(values[field.key])}
                onChange={(e) =>
                  set(field.key, e.target.checked as PropertyValues[typeof field.key])
                }
              />
              <span>
                {field.label}
                <span className="block text-[11px] text-neutral-600">{field.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save property"}
        </Button>
        {result && <span className="text-xs text-emerald-300">{result}</span>}
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>
    </Card>
  );
}

export function AddVendorForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trade, setTrade] = useState<VendorTrade>("HANDYMAN");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    await fetch("/api/property/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, trade, phone, notes }),
    });
    setPending(false);
    setName("");
    setPhone("");
    setNotes("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        + Add a vendor
      </Button>
    );
  }

  return (
    <Card>
      <p className="font-semibold">Add a vendor</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Name</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Trade</label>
          <select
            className={inputClass}
            value={trade}
            onChange={(e) => setTrade(e.target.value as VendorTrade)}
          >
            {Object.entries(TRADE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Notes</label>
          <input
            className={inputClass}
            placeholder="Did the water heater in 2024, quick to respond"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button disabled={pending || !name} onClick={() => void create()}>
          {pending ? "Adding…" : "Add vendor"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export function AddEquipmentForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("HVAC");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [installedOn, setInstalledOn] = useState("");
  const [warrantyExpiresOn, setWarrantyExpiresOn] = useState("");
  const [filterSize, setFilterSize] = useState("");
  const [batteryType, setBatteryType] = useState("");
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    await fetch("/api/property/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        kind,
        brand,
        model,
        installedOn: installedOn || undefined,
        warrantyExpiresOn: warrantyExpiresOn || undefined,
        filterSize,
        batteryType,
      }),
    });
    setPending(false);
    setName("");
    setBrand("");
    setModel("");
    setInstalledOn("");
    setWarrantyExpiresOn("");
    setFilterSize("");
    setBatteryType("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        + Add equipment
      </Button>
    );
  }

  return (
    <Card>
      <p className="font-semibold">Add equipment</p>
      <p className="mt-1 text-sm text-neutral-400">
        The filter size and install date are the two things nobody can find when
        they need them.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Name</label>
          <input
            className={inputClass}
            placeholder="Upstairs furnace"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Kind</label>
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(EQUIPMENT_KINDS).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Brand</label>
          <input className={inputClass} value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Model</label>
          <input className={inputClass} value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Installed</label>
          <input
            type="date"
            className={inputClass}
            value={installedOn}
            onChange={(e) => setInstalledOn(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Warranty expires</label>
          <input
            type="date"
            className={inputClass}
            value={warrantyExpiresOn}
            onChange={(e) => setWarrantyExpiresOn(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Filter size</label>
          <input
            className={inputClass}
            placeholder="20x25x1"
            value={filterSize}
            onChange={(e) => setFilterSize(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Battery type</label>
          <input
            className={inputClass}
            placeholder="CR123A"
            value={batteryType}
            onChange={(e) => setBatteryType(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button disabled={pending || !name} onClick={() => void create()}>
          {pending ? "Adding…" : "Add equipment"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export function DeleteButton({
  endpoint,
  label = "Remove",
}: {
  endpoint: string;
  label?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        className="!px-2 !py-1 text-xs text-neutral-500"
        onClick={() => setConfirming(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        className="!px-2 !py-1 text-xs text-rose-300"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await fetch(endpoint, { method: "DELETE" });
          setPending(false);
          router.refresh();
        }}
      >
        {pending ? "…" : "Confirm"}
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
