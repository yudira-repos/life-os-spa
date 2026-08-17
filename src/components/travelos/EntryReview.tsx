"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";

// The review row. This is the human-in-the-loop control for calendar
// extraction, and its job is to make a wrong date easy to spot and fast to
// fix — low-confidence rows are visually loud on purpose.

export interface ReviewEntry {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  kind: string;
  noSchool: boolean;
  source: string;
  confidence: number | null;
  confirmed: boolean;
}

const KINDS = [
  { value: "BREAK", label: "Break" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "TEACHER_DAY", label: "Teacher day" },
  { value: "EARLY_RELEASE", label: "Early release" },
  { value: "FIRST_DAY", label: "First day" },
  { value: "LAST_DAY", label: "Last day" },
  { value: "OTHER", label: "Other" },
];

export function EntryReviewRow({
  calendarId,
  entry,
}: {
  calendarId: string;
  entry: ReviewEntry;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(entry);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  const lowConfidence = !entry.confirmed && (entry.confidence ?? 1) < 0.7;

  async function save(payload: Partial<ReviewEntry>) {
    setPending(true);
    await fetch(`/api/travel/calendars/${calendarId}/entries`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: entry.id, ...payload }),
    });
    setPending(false);
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    setPending(true);
    await fetch(`/api/travel/calendars/${calendarId}/entries?entryId=${entry.id}`, {
      method: "DELETE",
    });
    setPending(false);
    router.refresh();
  }

  return (
    <div
      className={clsx(
        "px-5 py-3",
        lowConfidence && "border-l-2 border-amber-400/60 bg-amber-500/[0.04]"
      )}
    >
      {editing ? (
        <div className="flex flex-col gap-3">
          <input
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60"
              value={draft.startDate.slice(0, 10)}
              onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
            />
            <input
              type="date"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60"
              value={draft.endDate.slice(0, 10)}
              onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
            />
            <select
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60"
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
            >
              {KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={draft.noSchool}
                onChange={(e) => setDraft({ ...draft, noSchool: e.target.checked })}
              />
              No school
            </label>
          </div>
          <div className="flex gap-2">
            <Button
              className="!px-3 !py-1.5 text-xs"
              disabled={pending}
              onClick={() =>
                void save({
                  title: draft.title,
                  startDate: draft.startDate.slice(0, 10),
                  endDate: draft.endDate.slice(0, 10),
                  kind: draft.kind,
                  noSchool: draft.noSchool,
                })
              }
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="ghost"
              className="!px-3 !py-1.5 text-xs"
              onClick={() => {
                setDraft(entry);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-neutral-200">
              {entry.title}
              {!entry.noSchool && (
                <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-neutral-500">
                  school day
                </span>
              )}
              {lowConfidence && (
                <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                  check this one
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {formatRange(entry.startDate, entry.endDate)} ·{" "}
              {KINDS.find((k) => k.value === entry.kind)?.label ?? entry.kind}
              {entry.source === "LLM" && entry.confidence != null && (
                <> · read from the file, {Math.round(entry.confidence * 100)}% confident</>
              )}
              {entry.source === "MANUAL" && <> · edited by you</>}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {!entry.confirmed && (
              <Button
                variant="secondary"
                className="!px-3 !py-1.5 text-xs"
                disabled={pending}
                onClick={() => void save({})}
              >
                Looks right
              </Button>
            )}
            {entry.confirmed && (
              <span className="mr-1 text-xs text-emerald-400">✓</span>
            )}
            <Button
              variant="ghost"
              className="!px-2 !py-1 text-xs"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              className="!px-2 !py-1 text-xs text-neutral-500"
              disabled={pending}
              onClick={() => void remove()}
            >
              Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConfirmCalendarButton({
  calendarId,
  unreviewed,
}: {
  calendarId: string;
  unreviewed: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/travel/calendars/${calendarId}/confirm`, {
      method: "POST",
    });
    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setError(data.error ?? "Could not confirm.");
      return;
    }
    setResult(
      `Confirmed. Found ${data.windowsFound} travel window${data.windowsFound === 1 ? "" : "s"} across ${data.childrenCovered} ${data.childrenCovered === 1 ? "child" : "children"}.`
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Button disabled={pending || unreviewed > 0} onClick={() => void confirm()}>
          {pending ? "Confirming…" : "Confirm this calendar"}
        </Button>
        {unreviewed > 0 && (
          <span className="text-xs text-amber-300">
            {unreviewed} date{unreviewed === 1 ? "" : "s"} still to review
          </span>
        )}
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {result && <p className="text-xs text-emerald-300">{result}</p>}
    </div>
  );
}

function formatRange(start: string, end: string): string {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  };
  const startText = new Date(start).toLocaleDateString("en-US", options);
  if (start.slice(0, 10) === end.slice(0, 10)) return startText;
  return `${startText} – ${new Date(end).toLocaleDateString("en-US", options)}`;
}
