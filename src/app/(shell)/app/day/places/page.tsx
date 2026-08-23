"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface Place {
  id: string;
  label: string;
  kind: string;
  address: string;
  parkingBufferMinutes: number;
}

const PLACE_KINDS = [
  { value: "HOME", label: "Home" },
  { value: "SCHOOL", label: "School" },
  { value: "WORK", label: "Work" },
  { value: "CUSTOM", label: "Custom" },
];

export default function PlacesPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    label: "",
    kind: "CUSTOM",
    address: "",
    parkingBufferMinutes: 0,
  });

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchPlaces = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/setup/places");
      if (!response.ok) throw new Error("Failed to fetch places");
      const data = await response.json();
      setPlaces(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load places");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Deferred: calling fetchPlaces() synchronously in the effect body sets
    // state during the same commit, which React flags as a cascading render.
    void Promise.resolve().then(fetchPlaces);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]:
        type === "number" ? (value ? parseInt(value) : 0) : value,
    }));
  };

  const handleAddPlace = async () => {
    if (!formData.label.trim() || !formData.address.trim()) {
      setError("Place name and address are required");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/setup/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: formData.label.trim(),
          kind: formData.kind,
          address: formData.address.trim(),
          parkingBufferMinutes: formData.parkingBufferMinutes || 0,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create place");
      }

      const newPlace = await response.json();
      setPlaces([...places, newPlace]);
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
      setSubmitting(false);
    }
  };

  const handleRemovePlace = (id: string) => {
    setPlaces(places.filter(p => p.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-neutral-400">Loading places...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto px-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold">Places</h1>
        <p className="mt-2 text-neutral-400">
          Manage locations for your household activities.
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-medium mb-4">Add New Place</h2>
          </div>

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
              placeholder="e.g., Elementary School"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-neutral-600 focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="kind" className="block text-sm font-medium">
                Kind
              </label>
              <select
                id="kind"
                name="kind"
                value={formData.kind}
                onChange={handleInputChange}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              >
                {PLACE_KINDS.map(k => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="parkingBufferMinutes" className="block text-sm font-medium">
                Parking Buffer (min)
              </label>
              <input
                id="parkingBufferMinutes"
                type="number"
                name="parkingBufferMinutes"
                value={formData.parkingBufferMinutes}
                onChange={handleInputChange}
                min="0"
                max="120"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
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
              placeholder="e.g., 123 Main St, City, State"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder-neutral-600 focus:border-indigo-400 focus:outline-none"
            />
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
            disabled={!formData.label.trim() || !formData.address.trim() || submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Adding..." : "Add Place"}
          </button>
        </div>
      </Card>

      {places.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-3">Places ({places.length})</p>
          <div className="flex flex-col gap-2">
            {places.map(place => (
              <Card key={place.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-medium">{place.label}</p>
                    <p className="text-sm text-neutral-400 mt-1">{place.address}</p>
                    <p className="text-xs text-neutral-500 mt-1">
                      {place.kind} · Parking buffer: {place.parkingBufferMinutes}min
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemovePlace(place.id)}
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
    </div>
  );
}
