"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface GroupState {
  exists: boolean;
  name?: string;
  channelAddress?: string;
  broadcastEnabled?: boolean;
  members?: { name: string; external: boolean }[];
}

export default function CarpoolPage() {
  const [state, setState] = useState<GroupState | null>(null);
  const [name, setName] = useState("School carpool");
  const [address, setAddress] = useState("");
  const [broadcast, setBroadcast] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/setup/carpool-group")
      .then((r) => r.json())
      .then((s: GroupState) => {
        setState(s);
        if (s.exists) {
          setName(s.name ?? "School carpool");
          setAddress(s.channelAddress ?? "");
          setBroadcast(Boolean(s.broadcastEnabled));
        }
      })
      .catch(() => setError("Could not load the carpool group."));
  }, []);

  const save = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/setup/carpool-group", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, channelAddress: address, broadcastEnabled: broadcast }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save.");
      setSaved(true);
      setState({ ...(state ?? { exists: true }), exists: true, broadcastEnabled: body.broadcastEnabled });
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-3xl font-semibold">Carpool</h1>
        <p className="mt-2 text-neutral-400">
          Where the daily school-run post goes. It names who has each run and when —
          nothing else. No addresses, no leave times.
        </p>
      </div>

      <Card>
        <h2 className="text-lg font-medium">The group</h2>

        <div className="mt-4">
          <label htmlFor="gname" className="block text-sm font-medium">Name</label>
          <input
            id="gname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
          <p className="mt-2 text-xs text-neutral-500">Appears as the first line of each post.</p>
        </div>

        <div className="mt-4">
          <label htmlFor="jid" className="block text-sm font-medium">WhatsApp group id</label>
          <input
            id="jid"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="120363043211234567@g.us"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm placeholder-neutral-600 focus:border-indigo-400 focus:outline-none"
          />
          <p className="mt-2 text-xs text-neutral-500">
            From <code className="text-neutral-400">openclaw channels status whatsapp</code> once
            the gateway is paired. Leave empty until then.
          </p>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={broadcast}
            onChange={(e) => setBroadcast(e.target.checked)}
            className="mt-1 rounded border border-white/10 bg-white/5"
          />
          <span>
            <span className="block text-sm font-medium">Post to the group each morning</span>
            <span className="block text-xs text-neutral-500">
              Weekdays at 6:30. Silent at weekends and on no-school days. This sends to
              other families and there is no unsend — leave it off until you have read a
              preview.
            </span>
          </span>
        </label>

        {state?.members && state.members.length > 0 && (
          <p className="mt-4 text-xs text-neutral-500">
            On the rota: {state.members.map((m) => m.name).join(", ")}
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-xs text-emerald-400">Saved</span>}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-medium">Preview today&apos;s post</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Exactly what the group would receive. Reads from the live rota and sends
          nothing.
        </p>
        <button
          onClick={async () => {
            setPreview(null);
            const res = await fetch("/api/setup/carpool-group/preview");
            const body = await res.json();
            setPreview(
              res.ok
                ? body.empty
                  ? "Nothing scheduled today — no post would be sent."
                  : body.reply_text
                : (body.error ?? "Could not build a preview.")
            );
          }}
          className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 hover:bg-white/10"
        >
          Show preview
        </button>
        {preview && (
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-sm text-neutral-200">
            {preview}
          </pre>
        )}
      </Card>
    </div>
  );
}
