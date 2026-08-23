"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface Prefs {
  whatsappNumber: string;
  quietFromMinute: number | null;
  quietToMinute: number | null;
  calendarBrief: boolean;
  leaveNowAlerts: boolean;
  aiNewsBrief: boolean;
}

const TOGGLES: { key: keyof Prefs; label: string; help: string }[] = [
  {
    key: "calendarBrief",
    label: "Morning schedule",
    help: "Your day's events and the first departure, at the household's brief time.",
  },
  {
    key: "leaveNowAlerts",
    label: "Leave now alerts",
    help: "Sent when it's time to go for something you're responsible for. Ignores quiet hours — missing a pickup outranks a quiet hour.",
  },
  {
    key: "aiNewsBrief",
    label: "AI news digest",
    help: "A daily headlines summary. Off unless you ask for it.",
  },
];

function minuteToTime(m: number | null): string {
  if (m == null) return "";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function timeToMinute(value: string): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}

export function NotificationForm() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/notify/preferences")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load your settings."))))
      .then(setPrefs)
      .catch((e: Error) => setError(e.message));
  }, []);

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/notify/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save.");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (error && !prefs) {
    return (
      <Card className="mt-4 border-red-400/20 bg-red-500/5">
        <p className="text-sm text-red-300">{error}</p>
      </Card>
    );
  }
  if (!prefs) {
    return (
      <Card className="mt-4">
        <p className="text-sm text-neutral-500">Loading your notification settings…</p>
      </Card>
    );
  }

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) =>
    setPrefs({ ...prefs, [key]: value });

  const hasNumber = prefs.whatsappNumber.trim().length > 0;

  return (
    <Card className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Notifications
      </p>

      <div className="mt-4">
        <label htmlFor="wa" className="block text-sm font-medium">
          WhatsApp number
        </label>
        <input
          id="wa"
          type="tel"
          value={prefs.whatsappNumber}
          onChange={(e) => set("whatsappNumber", e.target.value)}
          placeholder="+1 415 555 0100"
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-neutral-600 focus:border-indigo-400 focus:outline-none"
        />
        <p className="mt-2 text-xs text-neutral-500">
          Include the country code. Leave this empty to turn WhatsApp off — you&apos;ll
          still get everything in the app.
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {TOGGLES.map((toggle) => (
          <label key={toggle.key} className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={Boolean(prefs[toggle.key])}
              onChange={(e) => set(toggle.key, e.target.checked as never)}
              className="mt-1 rounded border border-white/10 bg-white/5"
            />
            <span>
              <span className="block text-sm font-medium">{toggle.label}</span>
              <span className="block text-xs text-neutral-500">{toggle.help}</span>
            </span>
          </label>
        ))}
      </div>

      {hasNumber && (
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="qf" className="block text-sm font-medium">
              Quiet from
            </label>
            <input
              id="qf"
              type="time"
              value={minuteToTime(prefs.quietFromMinute)}
              onChange={(e) => set("quietFromMinute", timeToMinute(e.target.value))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="qt" className="block text-sm font-medium">
              Quiet until
            </label>
            <input
              id="qt"
              type="time"
              value={minuteToTime(prefs.quietToMinute)}
              onChange={(e) => set("quietToMinute", timeToMinute(e.target.value))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <p className="col-span-2 -mt-1 text-xs text-neutral-500">
            Briefs wait until quiet hours end. Leave-now alerts are sent anyway.
          </p>
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>
    </Card>
  );
}
