"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Card } from "@/components/ui/card";

export interface Place {
  id: string;
  label: string;
  kind: string;
  address: string;
  parkingBufferMinutes: number;
}

interface AddPlacesStepProps {
  places: Place[];
  onPlacesChange: (places: Place[]) => void;
  onNext: () => void;
}

const PLACE_KINDS = [
  { value: "HOME", label: "Home" },
  { value: "WORK", label: "Work" },
  { value: "SCHOOL", label: "School" },
  { value: "ACTIVITY", label: "Activity/Sport" },
  { value: "CUSTOM", label: "Other" },
];

export function AddPlacesStep({ places, onPlacesChange, onNext }: AddPlacesStepProps) {
  const [formData, setFormData] = useState({
    label: "",
    kind: "CUSTOM",
    address: "",
    parkingBufferMinutes: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === "parkingBufferMinutes" ? parseInt(value) || 0 : value,
    }));
    setError(null);
  };

  const handleAddPlace = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/setup/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create place");
      }

      const newPlace = await response.json();
      onPlacesChange([...places, newPlace]);
      setFormData({
        label: "",
        kind: "CUSTOM",
        address: "",
        parkingBufferMinutes: 0,
      });
      setSuccess(`${newPlace.label} added!`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create place");
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePlace = (id: string) => {
    onPlacesChange(places.filter(p => p.id !== id));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">Add Places</h2>
        <p className="mt-2 text-neutral-400">
          Where do your family&apos;s regular activities happen? Add at least 2 places (e.g., home and school).
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="label" className="block text-sm font-medium">
              Place Name *
            </label>
            <input
              id="label"
              type="text"
              name="label"
              value={formData.label}
              onChange={handleInputChange}
              placeholder="e.g., Riverside Elementary"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-neutral-600 focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="kind" className="block text-sm font-medium">
              Type of Place
            </label>
            <select
              id="kind"
              name="kind"
              value={formData.kind}
              onChange={handleInputChange}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            >
              {PLACE_KINDS.map(kind => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium">
              Address *
            </label>
            <input
              id="address"
              type="text"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              placeholder="e.g., 123 Main St, Springfield, IL"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-neutral-600 focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="parkingBufferMinutes" className="block text-sm font-medium">
              Parking/Wait Time (minutes)
            </label>
            <input
              id="parkingBufferMinutes"
              type="number"
              name="parkingBufferMinutes"
              value={formData.parkingBufferMinutes}
              onChange={handleInputChange}
              min="0"
              max="120"
              placeholder="e.g., 5"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-neutral-600 focus:border-indigo-400 focus:outline-none"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Extra time to add for parking, pickup lines, or waiting
            </p>
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
            onClick={handleAddPlace}
            disabled={!formData.label.trim() || !formData.address.trim() || loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Adding..." : "Add Place"}
          </button>
        </div>
      </Card>

      {places.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-3">Added Places ({places.length})</p>
          <div className="flex flex-col gap-2">
            {places.map(place => (
              <Card key={place.id} className="flex flex-wrap items-center justify-between">
                <div>
                  <p className="font-medium">{place.label}</p>
                  <p className="text-sm text-neutral-400">{place.address}</p>
                  {place.parkingBufferMinutes > 0 && (
                    <p className="text-xs text-neutral-500">
                      +{place.parkingBufferMinutes} min buffer
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleRemovePlace(place.id)}
                  className="px-3 py-1 text-sm text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button
          onClick={onNext}
          disabled={places.length < 2}
          className={clsx(
            "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            places.length >= 2
              ? "bg-indigo-600 text-white hover:bg-indigo-700"
              : "bg-neutral-700 text-neutral-400 cursor-not-allowed"
          )}
        >
          Next: Add Activities
        </button>
      </div>
    </div>
  );
}
