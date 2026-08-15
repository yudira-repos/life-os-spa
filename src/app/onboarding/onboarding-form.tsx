"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const ROLES = ["ADULT", "CHILD"] as const;

export function OnboardingForm() {
  const router = useRouter();
  const [householdName, setHouseholdName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("CHILD");
  const [birthdate, setBirthdate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        householdName,
        member: memberName
          ? { name: memberName, role, birthdate: birthdate || null }
          : null,
      }),
    });

    if (!res.ok) {
      setError("Something went wrong — try again.");
      setSubmitting(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6"
    >
      <label className="flex flex-col gap-2 text-sm">
        Household name
        <input
          required
          value={householdName}
          onChange={(e) => setHouseholdName(e.target.value)}
          placeholder="The Nukala Family"
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-indigo-400"
        />
      </label>

      <div className="border-t border-white/10 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Add a family member (optional — you can add more later)
        </p>
        <div className="flex flex-col gap-3">
          <input
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            placeholder="Name"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
          <div className="flex gap-3">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
              className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r === "ADULT" ? "Adult" : "Child"}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Button type="submit" disabled={submitting || !householdName}>
        {submitting ? "Setting up…" : "Continue to LifeOS"}
      </Button>
    </form>
  );
}
