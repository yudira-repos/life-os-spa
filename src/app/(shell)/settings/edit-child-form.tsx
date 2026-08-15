"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const GRADES = [3, 4, 5, 6];

export function EditChildForm({
  memberId,
  initialGrade,
  initialInterests,
}: {
  memberId: string;
  initialGrade: number | null;
  initialInterests: string | null;
}) {
  const router = useRouter();
  const [grade, setGrade] = useState(initialGrade ? String(initialGrade) : "");
  const [interests, setInterests] = useState(initialInterests ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/household/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade: grade || null, interests: interests || null }),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-2 py-2">
      <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
        Grade
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs outline-none focus:border-indigo-400"
        >
          <option value="">Not set</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11px] text-neutral-500">
        Interests
        <input
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
          placeholder="soccer, minecraft, art"
          className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs outline-none focus:border-indigo-400"
        />
      </label>
      <Button type="button" variant="ghost" className="!px-3 !py-1.5 text-xs" disabled={saving} onClick={save}>
        {saved ? "Saved" : saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
