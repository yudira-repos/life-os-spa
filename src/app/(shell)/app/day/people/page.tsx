"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface Contact {
  id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
}

const RELATIONSHIPS = [
  { value: "CARPOOL_PARENT", label: "Carpool parent" },
  { value: "GRANDPARENT", label: "Grandparent" },
  { value: "SITTER", label: "Sitter" },
  { value: "COACH", label: "Coach" },
  { value: "OTHER", label: "Other" },
];

export default function PeoplePage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", relationship: "CARPOOL_PARENT", phone: "" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setup/contacts");
      if (!res.ok) throw new Error("Could not load your contacts.");
      setContacts(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your contacts.");
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

  const add = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not add them.");
      setContacts([...contacts, body].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ name: "", relationship: "CARPOOL_PARENT", phone: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add them.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    const res = await fetch(`/api/setup/contacts?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Could not remove them.");
      return;
    }
    setContacts(contacts.filter((c) => c.id !== id));
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-3xl font-semibold">People</h1>
        <p className="mt-2 text-neutral-400">
          The parents outside your household who share a run. They don&apos;t need a
          LifeOS account — adding them here is enough to put them on a rotation.
        </p>
      </div>

      <Card>
        <h2 className="text-lg font-medium">Add someone</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              Name *
            </label>
            <input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Aarti"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-neutral-600 focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="rel" className="block text-sm font-medium">
              Relationship
            </label>
            <select
              id="rel"
              value={form.relationship}
              onChange={(e) => setForm({ ...form, relationship: e.target.value })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            >
              {RELATIONSHIPS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium">
              Phone (optional)
            </label>
            <input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 415 555 0100"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-neutral-600 focus:border-indigo-400 focus:outline-none"
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          A phone number is only stored, never messaged. LifeOS posts to the carpool
          group, not to individual parents.
        </p>
        {error && (
          <div className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}
        <button
          onClick={add}
          disabled={!form.name.trim() || saving}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add person"}
        </button>
      </Card>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : contacts.length > 0 ? (
        <div>
          <p className="mb-3 text-sm font-medium">People ({contacts.length})</p>
          <div className="flex flex-col gap-2">
            {contacts.map((c) => (
              <Card key={c.id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-neutral-500">
                      {RELATIONSHIPS.find((r) => r.value === c.relationship)?.label ?? "Contact"}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(c.id)}
                    className="px-3 py-1 text-sm text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <Card>
          <p className="text-sm text-neutral-400">
            Nobody yet. Add the other parents in your carpool — you&apos;ll pick them
            when you build the rotation.
          </p>
        </Card>
      )}
    </div>
  );
}
