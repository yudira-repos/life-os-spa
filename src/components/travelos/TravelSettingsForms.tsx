"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { STYLE_LABELS, type DestinationStyle } from "@/lib/travelos/destinations";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60";
const labelClass = "text-xs font-medium text-neutral-400";

export interface PreferencesValues {
  homeAirport: string;
  maxFlightHours: number;
  domesticOnly: boolean;
  passportsReady: boolean;
  budgetPerTripDollars: number;
  preferredStyles: string[];
}

export function TravelPreferencesForm({ initial }: { initial: PreferencesValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStyle(style: DestinationStyle) {
    setValues((current) => ({
      ...current,
      preferredStyles: current.preferredStyles.includes(style)
        ? current.preferredStyles.filter((s) => s !== style)
        : [...current.preferredStyles, style],
    }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/travel/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        budgetPerTripCents: Math.round(values.budgetPerTripDollars * 100),
      }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <Card>
      <p className="font-semibold">Travel preferences</p>
      <p className="mt-1 text-sm text-neutral-400">
        The home airport is required before any flight search can run.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Home airport (IATA)</label>
          <input
            className={inputClass}
            placeholder="SFO"
            maxLength={3}
            value={values.homeAirport}
            onChange={(e) => {
              setValues({ ...values, homeAirport: e.target.value.toUpperCase() });
              setSaved(false);
            }}
          />
        </div>

        <div>
          <label className={labelClass}>Max flight time (hours)</label>
          <input
            type="number"
            min={1}
            max={20}
            className={inputClass}
            value={values.maxFlightHours}
            onChange={(e) => {
              setValues({ ...values, maxFlightHours: Number(e.target.value) });
              setSaved(false);
            }}
          />
        </div>

        <div>
          <label className={labelClass}>Budget per trip ($)</label>
          <input
            type="number"
            min={0}
            step={100}
            className={inputClass}
            placeholder="6000"
            value={values.budgetPerTripDollars || ""}
            onChange={(e) => {
              setValues({ ...values, budgetPerTripDollars: Number(e.target.value) });
              setSaved(false);
            }}
          />
          <p className="mt-1 text-[11px] text-neutral-600">
            Leave blank if you&apos;d rather see everything.
          </p>
        </div>

        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={values.domesticOnly}
              onChange={(e) => {
                setValues({ ...values, domesticOnly: e.target.checked });
                setSaved(false);
              }}
            />
            Domestic only
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={values.passportsReady}
              onChange={(e) => {
                setValues({ ...values, passportsReady: e.target.checked });
                setSaved(false);
              }}
            />
            Everyone&apos;s passport is valid
          </label>
        </div>
      </div>

      <div className="mt-5">
        <p className={labelClass}>What the family likes</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(STYLE_LABELS) as DestinationStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => toggleStyle(style)}
              className={
                values.preferredStyles.includes(style)
                  ? "rounded-full bg-indigo-500/20 px-3 py-1.5 text-sm text-indigo-200"
                  : "rounded-full bg-white/5 px-3 py-1.5 text-sm text-neutral-400 hover:bg-white/10"
              }
            >
              {STYLE_LABELS[style]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save preferences"}
        </Button>
        {saved && <span className="text-xs text-emerald-300">Saved.</span>}
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>
    </Card>
  );
}

export function AvailabilityForm({
  memberId,
  memberName,
  ptoDaysPerYear,
  ptoDaysRemaining,
}: {
  memberId: string;
  memberName: string;
  ptoDaysPerYear: number;
  ptoDaysRemaining: number;
}) {
  const router = useRouter();
  const [perYear, setPerYear] = useState(ptoDaysPerYear);
  const [remaining, setRemaining] = useState(ptoDaysRemaining);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/travel/availability/${memberId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ptoDaysPerYear: perYear, ptoDaysRemaining: remaining }),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3 px-5 py-4">
      <div className="min-w-[8rem] flex-1">
        <p className="text-sm font-medium text-neutral-200">{memberName}</p>
      </div>
      <div>
        <label className={labelClass}>PTO days / year</label>
        <input
          type="number"
          min={0}
          max={365}
          className="mt-1 w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60"
          value={perYear}
          onChange={(e) => {
            setPerYear(Number(e.target.value));
            setSaved(false);
          }}
        />
      </div>
      <div>
        <label className={labelClass}>Days left</label>
        <input
          type="number"
          min={0}
          max={365}
          className="mt-1 w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60"
          value={remaining}
          onChange={(e) => {
            setRemaining(Number(e.target.value));
            setSaved(false);
          }}
        />
      </div>
      <Button
        variant="secondary"
        className="!px-3 !py-1.5 text-xs"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
      {saved && <span className="text-xs text-emerald-300">Saved.</span>}
    </div>
  );
}

export function BlackoutForm({
  members,
}: {
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [memberId, setMemberId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setPending(true);
    setError(null);
    const response = await fetch("/api/travel/blackouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: memberId || undefined, startDate, endDate, reason }),
    });
    const data = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? "Could not add.");
      return;
    }
    setStartDate("");
    setEndDate("");
    setReason("");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className={labelClass}>Who</label>
        <select
          className="mt-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
        >
          <option value="">Whole household</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>From</label>
        <input
          type="date"
          className="mt-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
      <div>
        <label className={labelClass}>To</label>
        <input
          type="date"
          className="mt-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
      <div className="min-w-[10rem] flex-1">
        <label className={labelClass}>Reason (optional)</label>
        <input
          className={inputClass}
          placeholder="Quarter close"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <Button
        variant="secondary"
        className="!px-3 !py-2 text-xs"
        disabled={pending || !startDate}
        onClick={() => void add()}
      >
        {pending ? "Adding…" : "Add blackout"}
      </Button>
      {error && <p className="w-full text-xs text-rose-300">{error}</p>}
    </div>
  );
}

export function DeleteBlackoutButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="ghost"
      className="!px-2 !py-1 text-xs text-neutral-500"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch(`/api/travel/blackouts/${id}`, { method: "DELETE" });
        setPending(false);
        router.refresh();
      }}
    >
      Remove
    </Button>
  );
}
