"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { clsx } from "clsx";

interface Person { assignee: string; name: string; external: boolean }
interface Slot { weekday: number | null; orderIndex: number; assignee: string; name: string; external: boolean }
interface Rotation {
  id: string;
  name: string;
  kind: string;
  anchorDay: string;
  slots: Slot[];
}

const WEEKDAYS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export default function RotationsPage() {
  const [rotations, setRotations] = useState<Rotation[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [kind, setKind] = useState<"FIXED_WEEKDAY" | "ROUND_ROBIN">("FIXED_WEEKDAY");
  const [name, setName] = useState("");
  const [anchorDay, setAnchorDay] = useState("");
  const [byWeekday, setByWeekday] = useState<Record<number, string>>({});
  const [turns, setTurns] = useState<string[]>([""]);

  const load = async () => {
    setLoading(true);
    try {
      const [rotRes, memRes, conRes] = await Promise.all([
        fetch("/api/setup/rotations"),
        fetch("/api/setup/household-members"),
        fetch("/api/setup/contacts"),
      ]);
      if (!rotRes.ok) throw new Error("Could not load rotations.");
      setRotations(await rotRes.json());

      const members = memRes.ok ? await memRes.json() : [];
      const contacts = conRes.ok ? await conRes.json() : [];
      setPeople([
        ...members.map((m: { id: string; name: string }) => ({
          assignee: `member:${m.id}`, name: m.name, external: false,
        })),
        ...contacts.map((c: { id: string; name: string }) => ({
          assignee: `contact:${c.id}`, name: c.name, external: true,
        })),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load rotations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Deferred: calling load() synchronously in the effect body sets state
    // during the same commit, which React flags as a cascading render.
    void Promise.resolve().then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setSaving(true); setError(null); setSuccess(null);
    const slots =
      kind === "FIXED_WEEKDAY"
        ? Object.entries(byWeekday)
            .filter(([, a]) => a)
            .map(([w, a]) => ({ weekday: Number(w), assignee: a }))
        : turns.filter(Boolean).map((a) => ({ assignee: a }));
    try {
      const res = await fetch("/api/setup/rotations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, kind, anchorDay: anchorDay || null, slots }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not create it.");
      setRotations([...rotations, body]);
      setName(""); setByWeekday({}); setTurns([""]); setAnchorDay("");
      setSuccess(`${body.name} created.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create it.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    const res = await fetch(`/api/setup/rotations?id=${id}`, { method: "DELETE" });
    if (!res.ok) { setError((await res.json()).error); return; }
    setRotations(rotations.filter((r) => r.id !== id));
  };

  const describe = (r: Rotation) =>
    r.kind === "ROUND_ROBIN"
      ? `Takes turns · ${r.slots.map((s) => s.name).join(" → ")}`
      : r.slots
          .slice()
          .sort((a, b) => (a.weekday ?? 0) - (b.weekday ?? 0))
          .map((s) => `${WEEKDAYS.find((w) => w.value === s.weekday)?.label}: ${s.name}`)
          .join(" · ");

  const ready =
    name.trim() &&
    (kind === "FIXED_WEEKDAY"
      ? Object.values(byWeekday).some(Boolean)
      : turns.filter(Boolean).length > 0 && anchorDay);

  const PersonSelect = ({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) => (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
    >
      <option value="">Nobody</option>
      {people.map((p) => (
        <option key={p.assignee} value={p.assignee}>
          {p.name}{p.external ? " (carpool)" : ""}
        </option>
      ))}
    </select>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-3xl font-semibold">Rotations</h1>
        <p className="mt-2 text-neutral-400">
          Who does a run, and how that&apos;s decided. Two shapes cover almost every
          family arrangement.
        </p>
      </div>

      {people.length === 0 && !loading && (
        <Card className="border-amber-400/20 bg-amber-500/5">
          <p className="text-sm text-neutral-300">
            No people to assign yet. Add the other carpool parents on the People tab
            first.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-medium">New rotation</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {([
            { k: "FIXED_WEEKDAY", t: "Same person each weekday", d: "Aarti always has Monday." },
            { k: "ROUND_ROBIN", t: "Takes turns", d: "Each family in order, cycling." },
          ] as const).map((opt) => (
            <button
              key={opt.k}
              type="button"
              onClick={() => setKind(opt.k)}
              className={clsx(
                "rounded-xl border p-3 text-left transition-colors",
                kind === opt.k
                  ? "border-indigo-400/40 bg-indigo-500/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              )}
            >
              <span className="block text-sm font-medium">{opt.t}</span>
              <span className="mt-1 block text-xs text-neutral-500">{opt.d}</span>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label htmlFor="rname" className="block text-sm font-medium">Name *</label>
          <input
            id="rname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "ROUND_ROBIN" ? "Friday pickup rota" : "Pickup (Mon/Wed/Thu)"}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-neutral-600 focus:border-indigo-400 focus:outline-none"
          />
        </div>

        {kind === "FIXED_WEEKDAY" ? (
          <div className="mt-4">
            <p className="text-sm font-medium">Who has each day</p>
            <p className="mt-1 text-xs text-neutral-500">Leave a day on “Nobody” if this rotation doesn&apos;t cover it.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {WEEKDAYS.slice(0, 5).map((d) => (
                <div key={d.value}>
                  <label htmlFor={`w${d.value}`} className="mb-1 block text-xs text-neutral-400">{d.label}</label>
                  <PersonSelect
                    id={`w${d.value}`}
                    value={byWeekday[d.value] ?? ""}
                    onChange={(v) => setByWeekday({ ...byWeekday, [d.value]: v })}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm font-medium">The order of turns</p>
            <p className="mt-1 text-xs text-neutral-500">
              List one turn per row, in order. Repeat someone to give them more turns —
              a four-turn cycle of A, B, C, B gives B every other week.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {turns.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-xs tabular-nums text-neutral-500">
                    Turn {i + 1}
                  </span>
                  <PersonSelect
                    id={`t${i}`}
                    value={t}
                    onChange={(v) => setTurns(turns.map((x, j) => (j === i ? v : x)))}
                  />
                  {turns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setTurns(turns.filter((_, j) => j !== i))}
                      className="px-2 text-sm text-red-400 hover:text-red-300"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setTurns([...turns, ""])}
              className="mt-2 text-sm text-indigo-300 underline underline-offset-2"
            >
              Add a turn
            </button>

            <div className="mt-4">
              <label htmlFor="anchor" className="block text-sm font-medium">
                First day of the cycle *
              </label>
              <input
                id="anchor"
                type="date"
                value={anchorDay}
                onChange={(e) => setAnchorDay(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none sm:w-56"
              />
              <p className="mt-2 text-xs text-neutral-500">
                The date turn 1 happened. Every later turn is counted from here, so
                changing it afterwards shifts the whole rota.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-lg border border-green-400/20 bg-green-500/10 p-3 text-sm text-green-300">
            {success}
          </div>
        )}

        <button
          onClick={create}
          disabled={!ready || saving}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create rotation"}
        </button>
      </Card>

      {!loading && rotations.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-medium">Rotations ({rotations.length})</p>
          <div className="flex flex-col gap-2">
            {rotations.map((r) => (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="mt-1 text-sm text-neutral-400">{describe(r)}</p>
                    {r.kind === "ROUND_ROBIN" && (
                      <p className="mt-1 text-xs text-neutral-600">
                        Cycle starts {new Date(r.anchorDay).toISOString().slice(0, 10)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => remove(r.id)}
                    className="px-3 py-1 text-sm text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
