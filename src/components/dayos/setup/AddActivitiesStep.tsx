"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Card } from "@/components/ui/card";
import type { Place } from "./AddPlacesStep";

export interface Activity {
  id: string;
  name: string;
  category: string;
  subjectMemberId: string | null;
  subjectMember?: { name: string } | null;
  placeId: string | null;
  place?: { label: string } | null;
  startMinute: number;
  durationMinutes: number | null;
  weekdays: string;
  requiresConfirmation?: boolean;
  // Present on rows that came back from /api/setup/activities; the setup
  // wizard builds Activity objects locally before they have these.
  status?: string;
  rotationId?: string | null;
  rotation?: { id: string; name: string } | null;
  carpoolRole?: string | null;
}

interface HouseholdMember {
  id: string;
  name: string;
  role: string;
}

interface AddActivitiesStepProps {
  places: Place[];
  members: HouseholdMember[];
  activities: Activity[];
  onActivitiesChange: (activities: Activity[]) => void;
  onNext: () => void;
  onBack: () => void;
}

const ACTIVITY_CATEGORIES = [
  { value: "SCHOOL", label: "School" },
  { value: "CLASS", label: "Class/Lesson" },
  { value: "SPORT", label: "Sport" },
  { value: "MEDICAL", label: "Medical" },
  { value: "ERRAND", label: "Errand" },
  { value: "COMMUTE", label: "Commute" },
  { value: "RELIGIOUS", label: "Religious" },
  { value: "SOCIAL", label: "Social" },
  { value: "OTHER", label: "Other" },
];

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

function minutesToTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function timeStringToMinutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

export function AddActivitiesStep({
  places,
  members,
  activities,
  onActivitiesChange,
  onNext,
  onBack,
}: AddActivitiesStepProps) {
  const [formData, setFormData] = useState({
    name: "",
    category: "SCHOOL",
    subjectMemberId: "",
    placeId: places[0]?.id || "",
    startTime: "08:00",
    durationMinutes: 60,
    weekdays: "1,2,3,4,5", // Monday to Friday
    requiresConfirmation: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
    setError(null);
  };

  const toggleWeekday = (weekday: number) => {
    const current = formData.weekdays.split(",").map(Number);
    const updated = current.includes(weekday)
      ? current.filter(d => d !== weekday)
      : [...current, weekday].sort();
    setFormData(prev => ({
      ...prev,
      weekdays: updated.join(","),
    }));
  };

  const handleAddActivity = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/setup/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          category: formData.category,
          subjectMemberId: formData.subjectMemberId || null,
          placeId: formData.placeId || null,
          startMinute: timeStringToMinutes(formData.startTime),
          durationMinutes: formData.durationMinutes || null,
          weekdays: formData.weekdays,
          requiresConfirmation: formData.requiresConfirmation,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create activity");
      }

      const newActivity = await response.json();
      onActivitiesChange([...activities, newActivity]);
      setFormData({
        name: "",
        category: "SCHOOL",
        subjectMemberId: "",
        placeId: places[0]?.id || "",
        startTime: "08:00",
        durationMinutes: 60,
        weekdays: "1,2,3,4,5",
        requiresConfirmation: false,
      });
      setSuccess(`${newActivity.name} added!`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create activity");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveActivity = (id: string) => {
    onActivitiesChange(activities.filter(a => a.id !== id));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">Add Activities</h2>
        <p className="mt-2 text-neutral-400">
          What are the regular things that happen? School pickup, dance class, soccer practice...
          Add 3-4 to get started.
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              Activity Name *
            </label>
            <input
              id="name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., School Pickup"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-neutral-600 focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="category" className="block text-sm font-medium">
                Category
              </label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              >
                {ACTIVITY_CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="subjectMemberId" className="block text-sm font-medium">
                For (Person)
              </label>
              <select
                id="subjectMemberId"
                name="subjectMemberId"
                value={formData.subjectMemberId}
                onChange={handleInputChange}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              >
                <option value="">Myself</option>
                {members.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="placeId" className="block text-sm font-medium">
                Location
              </label>
              <select
                id="placeId"
                name="placeId"
                value={formData.placeId}
                onChange={handleInputChange}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              >
                <option value="">No specific place</option>
                {places.map(place => (
                  <option key={place.id} value={place.id}>
                    {place.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="startTime" className="block text-sm font-medium">
                Start Time *
              </label>
              <input
                id="startTime"
                type="time"
                name="startTime"
                value={formData.startTime}
                onChange={handleInputChange}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="durationMinutes" className="block text-sm font-medium">
              Duration (minutes)
            </label>
            <input
              id="durationMinutes"
              type="number"
              name="durationMinutes"
              value={formData.durationMinutes}
              onChange={handleInputChange}
              min="0"
              placeholder="e.g., 60"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-neutral-600 focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div>
            <p className="block text-sm font-medium mb-2">When Does It Happen?</p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(day => (
                <button
                  key={day.value}
                  onClick={() => toggleWeekday(day.value)}
                  className={clsx(
                    "px-3 py-1 text-sm rounded-lg border transition-colors",
                    formData.weekdays.split(",").map(Number).includes(day.value)
                      ? "bg-indigo-600 border-indigo-400 text-white"
                      : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"
                  )}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="requiresConfirmation"
              checked={formData.requiresConfirmation}
              onChange={handleInputChange}
              className="rounded border border-white/10 bg-white/5"
            />
            <span className="text-sm">Requires confirmation from responsible person</span>
          </label>

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
            onClick={handleAddActivity}
            disabled={!formData.name.trim() || !formData.weekdays || loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Adding..." : "Add Activity"}
          </button>
        </div>
      </Card>

      {activities.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-3">Added Activities ({activities.length})</p>
          <div className="flex flex-col gap-2">
            {activities.map(activity => {
              const weekdayArray = activity.weekdays.split(",").map(Number);
              const dayLabels = WEEKDAYS.filter(d =>
                weekdayArray.includes(d.value)
              )
                .map(d => d.label)
                .join(", ");

              return (
                <Card key={activity.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-medium">{activity.name}</p>
                      {activity.subjectMember && (
                        <p className="text-sm text-neutral-400">
                          For: {activity.subjectMember.name}
                        </p>
                      )}
                      {activity.place && (
                        <p className="text-sm text-neutral-400">
                          At: {activity.place.label}
                        </p>
                      )}
                      <p className="text-xs text-neutral-500">
                        {minutesToTimeString(activity.startMinute)} ·{" "}
                        {dayLabels || "Once"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveActivity(activity.id)}
                      className="px-3 py-1 text-sm text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                </Card>
              );
            })}
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
          disabled={activities.length < 2}
          className={clsx(
            "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            activities.length >= 2
              ? "bg-indigo-600 text-white hover:bg-indigo-700"
              : "bg-neutral-700 text-neutral-400 cursor-not-allowed"
          )}
        >
          Next: Set up Rotation
        </button>
      </div>
    </div>
  );
}
