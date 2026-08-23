"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import type { Activity } from "@/components/dayos/setup/AddActivitiesStep";

interface Place {
  id: string;
  label: string;
}

interface HouseholdMember {
  id: string;
  name: string;
}

interface Rotation {
  id: string;
  name: string;
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

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [rotations, setRotations] = useState<Rotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editingRotationId, setEditingRotationId] = useState<string>("");
  const [activatingAll, setActivatingAll] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    category: "SCHOOL",
    subjectMemberId: "",
    placeId: "",
    rotationId: "",
    startTime: "08:00",
    durationMinutes: 60,
    weekdays: "1,2,3,4,5",
    requiresConfirmation: false,
    carpoolRole: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [activitiesRes, placesRes, membersRes, rotationsRes] = await Promise.all([
        fetch("/api/setup/activities"),
        fetch("/api/setup/places"),
        fetch("/api/setup/household-members"),
        fetch("/api/setup/rotations"),
      ]);

      if (!activitiesRes.ok || !placesRes.ok || !rotationsRes.ok) throw new Error("Failed to fetch data");

      const activitiesData = await activitiesRes.json();
      const placesData = await placesRes.json();
      const membersData = membersRes.ok ? await membersRes.json() : [];
      const rotationsData = rotationsRes.ok ? await rotationsRes.json() : [];

      setActivities(activitiesData);
      setPlaces(placesData);
      setMembers(membersData);
      setRotations(rotationsData);
      if (placesData.length > 0) {
        setFormData(prev => ({ ...prev, placeId: placesData[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Deferred: calling fetchData() synchronously in the effect body sets
    // state during the same commit, which React flags as a cascading render.
    void Promise.resolve().then(fetchData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
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
    if (!formData.name.trim()) {
      setError("Activity name is required");
      return;
    }

    setSubmitting(true);
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
          rotationId: formData.rotationId || null,
          startMinute: timeStringToMinutes(formData.startTime),
          durationMinutes: formData.durationMinutes || null,
          weekdays: formData.weekdays,
          requiresConfirmation: formData.requiresConfirmation,
          carpoolRole: formData.carpoolRole || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create activity");
      }

      const newActivity = await response.json();
      setActivities([...activities, newActivity]);
      setFormData({
        name: "",
        category: "SCHOOL",
        subjectMemberId: "",
        placeId: places[0]?.id || "",
        rotationId: "",
        startTime: "08:00",
        durationMinutes: 60,
        weekdays: "1,2,3,4,5",
        requiresConfirmation: false,
        carpoolRole: "",
      });
      setSuccess(`${newActivity.name} added!`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create activity");
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivateAll = async () => {
    setActivatingAll(true);
    setError(null);

    try {
      const response = await fetch("/api/setup/activities/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to activate activities");
      }

      const result = await response.json();
      setSuccess(result.message);
      setTimeout(() => setSuccess(null), 3000);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate activities");
    } finally {
      setActivatingAll(false);
    }
  };

  const handleEditRotation = async (activityId: string) => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/setup/activities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activityId,
          rotationId: editingRotationId || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update activity");
      }

      const updated = await response.json();
      setActivities(activities.map(a => a.id === activityId ? updated : a));
      setEditingActivityId(null);
      setSuccess("Activity rotation updated!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update activity");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveActivity = (id: string) => {
    setActivities(activities.filter(a => a.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-neutral-400">Loading activities...</div>
      </div>
    );
  }

  const inactiveCount = activities.filter(a => a.status !== "ACTIVE").length;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto px-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold">Activities</h1>
        <p className="mt-2 text-neutral-400">
          Manage recurring activities for your household.
        </p>
      </div>

      {inactiveCount > 0 && (
        <Card className="border-amber-400/20 bg-amber-500/5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-amber-300">
              {inactiveCount} activity(ies) need to be activated to show in your daily plan
            </p>
            <button
              onClick={handleActivateAll}
              disabled={activatingAll}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {activatingAll ? "Activating..." : "Activate All"}
            </button>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-medium mb-4">Add New Activity</h2>
          </div>

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
              <label htmlFor="rotationId" className="block text-sm font-medium">
                Rotation (Who does this?)
              </label>
              <select
                id="rotationId"
                name="rotationId"
                value={formData.rotationId}
                onChange={handleInputChange}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              >
                <option value="">None (manual assignment)</option>
                {rotations.map(rotation => (
                  <option key={rotation.id} value={rotation.id}>
                    {rotation.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div>
            <p className="block text-sm font-medium mb-2">When Does It Happen?</p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(day => (
                <button
                  key={day.value}
                  onClick={() => toggleWeekday(day.value)}
                  className={`px-3 py-1 text-sm rounded-lg border transition-colors ${
                    formData.weekdays.split(",").map(Number).includes(day.value)
                      ? "bg-indigo-600 border-indigo-400 text-white"
                      : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="carpoolRole" className="block text-sm font-medium">
              Part of a shared school run?
            </label>
            <select
              id="carpoolRole"
              name="carpoolRole"
              value={formData.carpoolRole}
              onChange={handleInputChange}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            >
              <option value="">No — just ours</option>
              <option value="DROPOFF">Yes — this is the drop-off</option>
              <option value="PICKUP">Yes — this is the pickup</option>
            </select>
            <p className="mt-2 text-xs text-neutral-500">
              Shared runs appear in the carpool group&apos;s morning post, labelled by
              which half of the day they are.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="requiresConfirmation"
              checked={formData.requiresConfirmation}
              onChange={handleInputChange}
              className="rounded border border-white/10 bg-white/5"
            />
            <span className="text-sm">Requires confirmation</span>
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
            disabled={!formData.name.trim() || !formData.weekdays || submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Adding..." : "Add Activity"}
          </button>
        </div>
      </Card>

      {activities.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-3">Activities ({activities.length})</p>
          <div className="flex flex-col gap-2">
            {activities.map(activity => {
              const weekdayArray = activity.weekdays.split(",").map(Number);
              const dayLabels = WEEKDAYS.filter(d =>
                weekdayArray.includes(d.value)
              )
                .map(d => d.label)
                .join(", ");

              const isEditing = editingActivityId === activity.id;
              const isActive = activity.status === "ACTIVE";

              return (
                <Card key={activity.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-medium">{activity.name}</p>
                      <div className="mt-2 space-y-1 text-sm text-neutral-400">
                        {activity.subjectMember && (
                          <p>For: {activity.subjectMember.name}</p>
                        )}
                        {activity.place && (
                          <p>At: {activity.place.label}</p>
                        )}
                        {isEditing ? (
                          <div className="mt-3 flex gap-2">
                            <select
                              value={editingRotationId}
                              onChange={(e) => setEditingRotationId(e.target.value)}
                              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                            >
                              <option value="">No rotation</option>
                              {rotations.map(rotation => (
                                <option key={rotation.id} value={rotation.id}>
                                  {rotation.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleEditRotation(activity.id)}
                              disabled={submitting}
                              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingActivityId(null)}
                              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-300 hover:bg-white/10"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            {activity.rotation && (
                              <p>Rotation: <span className="text-indigo-300">{activity.rotation.name}</span></p>
                            )}
                            {!activity.rotation && (
                              <p className="text-amber-300">No rotation assigned</p>
                            )}
                            {activity.carpoolRole && (
                              <p className="text-neutral-300">
                                Shared run ·{" "}
                                {activity.carpoolRole === "PICKUP" ? "Pickup" : "Drop-off"}
                              </p>
                            )}
                            {!isActive && (
                              <p className="text-red-400">Status: Inactive</p>
                            )}
                          </>
                        )}
                        <p className="text-xs text-neutral-500">
                          {minutesToTimeString(activity.startMinute)} · {dayLabels || "Once"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setEditingActivityId(activity.id);
                            setEditingRotationId(activity.rotationId || "");
                          }}
                          className="px-3 py-1 text-sm text-indigo-400 hover:text-indigo-300"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveActivity(activity.id)}
                        className="px-3 py-1 text-sm text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
