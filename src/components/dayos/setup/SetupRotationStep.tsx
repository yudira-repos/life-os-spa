"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Card } from "@/components/ui/card";

interface HouseholdMember {
  id: string;
  name: string;
  role: string;
}

interface RotationSlot {
  weekday: number;
  memberId: string | null;
}

interface Rotation {
  id: string;
  name: string;
  slots: Array<{
    weekday: number;
    member?: { name: string } | null;
  }>;
}

interface SetupRotationStepProps {
  members: HouseholdMember[];
  rotations: Rotation[];
  onRotationsChange: (rotations: Rotation[]) => void;
  onNext: () => void;
  onBack: () => void;
}

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function SetupRotationStep({
  members,
  rotations,
  onRotationsChange,
  onNext,
  onBack,
}: SetupRotationStepProps) {
  const [rotationName, setRotationName] = useState("Pickup Rotation");
  const [slots, setSlots] = useState<RotationSlot[]>(
    WEEKDAYS.map((day, idx) => ({
      weekday: day.value,
      memberId: idx < members.length ? members[idx].id : null,
    }))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleMemberChange = (weekday: number, memberId: string | null) => {
    setSlots(
      slots.map(slot =>
        slot.weekday === weekday ? { ...slot, memberId } : slot
      )
    );
    setError(null);
  };

  const handleAddRotation = async () => {
    if (!rotationName.trim()) {
      setError("Rotation name is required");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/setup/rotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: rotationName.trim(),
          slots: slots.map(slot => ({
            weekday: slot.weekday,
            memberId: slot.memberId || null,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create rotation");
      }

      const newRotation = await response.json();
      onRotationsChange([...rotations, newRotation]);
      setRotationName("Pickup Rotation");
      setSlots(
        WEEKDAYS.map((day, idx) => ({
          weekday: day.value,
          memberId: idx < members.length ? members[idx].id : null,
        }))
      );
      setSuccess(`${newRotation.name} created!`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rotation");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRotation = (id: string) => {
    onRotationsChange(rotations.filter(r => r.id !== id));
  };

  const allMembersAssigned = slots.every(slot => slot.memberId !== null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">Set Up Rotation</h2>
        <p className="mt-2 text-neutral-400">
          If multiple adults share responsibilities, assign who&apos;s doing pickup on which day.
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="rotationName" className="block text-sm font-medium">
              Rotation Name
            </label>
            <input
              id="rotationName"
              type="text"
              value={rotationName}
              onChange={e => setRotationName(e.target.value)}
              placeholder="e.g., Pickup Rotation"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-neutral-600 focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div>
            <p className="block text-sm font-medium mb-3">Who&apos;s Responsible Each Day?</p>
            <div className="flex flex-col gap-2">
              {WEEKDAYS.map(day => (
                <div
                  key={day.value}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white/3 p-3"
                >
                  <span className="text-sm font-medium">{day.label}</span>
                  <select
                    value={
                      slots.find(s => s.weekday === day.value)?.memberId || ""
                    }
                    onChange={e =>
                      handleMemberChange(day.value, e.target.value || null)
                    }
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-sm focus:border-indigo-400 focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {members.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-400/20 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-green-500/10 border border-green-400/20 p-3 text-sm text-green-300">
              {success}
            </div>
          )}

          <button
            onClick={handleAddRotation}
            disabled={!rotationName.trim() || loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Creating..." : "Create Rotation"}
          </button>
        </div>
      </Card>

      {rotations.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-3">Created Rotations ({rotations.length})</p>
          <div className="flex flex-col gap-2">
            {rotations.map(rotation => (
              <Card key={rotation.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-medium">{rotation.name}</p>
                    <div className="mt-2 text-sm text-neutral-400">
                      {WEEKDAYS.map(day => {
                        const slot = rotation.slots.find(
                          s => s.weekday === day.value
                        );
                        return (
                          <div key={day.value} className="text-xs">
                            {day.label}: {slot?.member?.name || "Unassigned"}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveRotation(rotation.id)}
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

      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className="flex-1 rounded-lg px-4 py-2 text-sm font-medium bg-neutral-700 text-white hover:bg-neutral-600 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 rounded-lg px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          Next: View Today
        </button>
      </div>
    </div>
  );
}
