"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ChildOption {
  id: string;
  name: string;
}

export function CalendarUpload({
  kids,
  extractionAvailable,
}: {
  // Named `kids`, not `children` — a `children` prop on a React component
  // means something else entirely, and the lint rule that catches it is right.
  kids: ChildOption[];
  extractionAvailable: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<string[]>(kids.map((c) => c.id));
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  function toggleChild(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    );
  }

  async function upload() {
    if (!file || selected.length === 0) return;
    setStatus("uploading");
    setError(null);
    setWarnings([]);

    const form = new FormData();
    form.append("file", file);
    if (name.trim()) form.append("name", name.trim());
    for (const id of selected) form.append("childIds", id);

    try {
      const response = await fetch("/api/travel/calendars", { method: "POST", body: form });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Upload failed.");
        setWarnings(data.warnings ?? []);
        setStatus("idle");
        return;
      }

      setStatus("idle");
      setFile(null);
      setName("");
      router.push(`/app/travel/calendars/${data.calendarId}`);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setStatus("idle");
    }
  }

  if (kids.length === 0) {
    return (
      <Card>
        <p className="text-sm text-neutral-400">
          Add your children in Settings first — a school calendar has to belong
          to someone for the window planner to know whose breaks these are.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="font-semibold">Upload a school calendar</p>
      <p className="mt-1 text-sm text-neutral-400">
        An .ics or .csv export is read exactly.{" "}
        {extractionAvailable
          ? "A PDF or a photo of the printed calendar is read by a model — you'll review every date it finds before anything uses them."
          : "PDF and photo reading needs ANTHROPIC_API_KEY set; without it, use an .ics or .csv export, or add dates by hand."}
      </p>

      <div className="mt-4">
        <label className="text-xs font-medium text-neutral-400">Calendar file</label>
        <input
          type="file"
          accept={extractionAvailable ? ".ics,.csv,.pdf,image/*" : ".ics,.csv"}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
          className="mt-1 block w-full text-sm text-neutral-300 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-neutral-100 hover:file:bg-white/15"
        />
      </div>

      <div className="mt-4">
        <label className="text-xs font-medium text-neutral-400">
          Name (optional)
        </label>
        <input
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60"
          placeholder="Lincoln Elementary 2026-27"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-neutral-400">Applies to</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {kids.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => toggleChild(child.id)}
              className={
                selected.includes(child.id)
                  ? "rounded-full bg-indigo-500/20 px-3 py-1.5 text-sm text-indigo-200"
                  : "rounded-full bg-white/5 px-3 py-1.5 text-sm text-neutral-400 hover:bg-white/10"
              }
            >
              {child.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-neutral-600">
          Siblings at the same school share one calendar. Different schools need
          one upload each — that&apos;s what lets the planner find the breaks
          they actually have in common.
        </p>
      </div>

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-300">
          {warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        <Button
          disabled={!file || selected.length === 0 || status === "uploading"}
          onClick={() => void upload()}
        >
          {status === "uploading" ? "Reading the calendar…" : "Upload and review"}
        </Button>
      </div>
    </Card>
  );
}
