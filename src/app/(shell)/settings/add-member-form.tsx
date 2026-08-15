"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const ROLES = ["ADULT", "CHILD", "GUEST"] as const;
const GRADES = [3, 4, 5, 6];

export function AddMemberForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("CHILD");
  const [birthdate, setBirthdate] = useState("");
  const [grade, setGrade] = useState("");
  const [interests, setInterests] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch("/api/household/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        role,
        birthdate: birthdate || null,
        grade: role === "CHILD" ? grade || null : null,
        interests: role === "CHILD" ? interests || null : null,
      }),
    });
    setName("");
    setBirthdate("");
    setGrade("");
    setInterests("");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r === "ADULT" ? "Adult" : r === "CHILD" ? "Child" : "Guest"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Birthdate
          <input
            type="date"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
        </label>
      </div>

      {role === "CHILD" && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/5 bg-black/20 p-3">
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Grade (for KidsOS Studies)
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">Not set</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-neutral-500">
            Interests (comma separated)
            <input
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="soccer, minecraft, art"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </label>
        </div>
      )}

      <div>
        <Button type="submit" disabled={submitting || !name} variant="secondary">
          Add
        </Button>
      </div>
    </form>
  );
}
