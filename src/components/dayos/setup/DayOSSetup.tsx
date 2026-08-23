"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { AddPlacesStep, type Place } from "./AddPlacesStep";
import { AddActivitiesStep, type Activity } from "./AddActivitiesStep";
import { SetupRotationStep } from "./SetupRotationStep";

interface HouseholdMember {
  id: string;
  name: string;
  role: string;
}

interface Rotation {
  id: string;
  name: string;
  slots: Array<{
    weekday: number;
    member?: { name: string } | null;
  }>;
}

interface DayOSSetupProps {
  householdId: string;
  members: HouseholdMember[];
}

type Step = "places" | "activities" | "rotation" | "complete";

export function DayOSSetup({ householdId, members }: DayOSSetupProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>("places");
  const [places, setPlaces] = useState<Place[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [rotations, setRotations] = useState<Rotation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePlacesNext = () => {
    if (places.length < 2) {
      setError("Please add at least 2 places");
      return;
    }
    setError(null);
    setCurrentStep("activities");
  };

  const handleActivitiesNext = () => {
    if (activities.length < 2) {
      setError("Please add at least 2 activities");
      return;
    }
    setError(null);
    setCurrentStep("rotation");
  };

  const handleRotationNext = async () => {
    setError(null);
    setIsLoading(true);

    try {
      // Trigger the planning engine to create occurrences for today and tomorrow
      const response = await fetch("/api/day/plan", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to plan the day");
      }

      setCurrentStep("complete");

      // Redirect to today page after a short delay
      setTimeout(() => {
        router.push("/app/day");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete setup");
      setIsLoading(false);
    }
  };

  const stepProgress = {
    places: 1,
    activities: 2,
    rotation: 3,
    complete: 4,
  };

  const currentProgress = stepProgress[currentStep];
  const totalSteps = 4;

  return (
    <div className="flex flex-col gap-8">
      {/* Progress Bar */}
      <div className="flex gap-4 items-center">
        {[1, 2, 3, 4].map(step => (
          <div key={step} className="flex items-center gap-2 flex-1">
            <div
              className={`h-2 flex-1 rounded-full transition-colors ${
                step <= currentProgress ? "bg-indigo-600" : "bg-neutral-700"
              }`}
            />
          </div>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <Card className="border-red-400/20 bg-red-500/5">
          <p className="text-sm text-red-300">{error}</p>
        </Card>
      )}

      {/* Steps */}
      {currentStep === "places" && (
        <AddPlacesStep
          places={places}
          onPlacesChange={setPlaces}
          onNext={handlePlacesNext}
        />
      )}

      {currentStep === "activities" && (
        <AddActivitiesStep
          places={places}
          members={members}
          activities={activities}
          onActivitiesChange={setActivities}
          onNext={handleActivitiesNext}
          onBack={() => {
            setError(null);
            setCurrentStep("places");
          }}
        />
      )}

      {currentStep === "rotation" && (
        <SetupRotationStep
          members={members}
          rotations={rotations}
          onRotationsChange={setRotations}
          onNext={handleRotationNext}
          onBack={() => {
            setError(null);
            setCurrentStep("activities");
          }}
        />
      )}

      {currentStep === "complete" && (
        <div className="flex flex-col gap-4">
          <Card className="border-green-400/20 bg-green-500/5">
            <div className="flex flex-col gap-3">
              <p className="text-lg font-semibold text-green-300">
                ✓ Setup Complete!
              </p>
              <div className="text-sm text-green-200">
                <p>Your household is ready:</p>
                <ul className="mt-2 list-inside space-y-1 text-xs text-green-200/80">
                  <li>✓ {places.length} place{places.length !== 1 ? "s" : ""} added</li>
                  <li>✓ {activities.length} activit{activities.length !== 1 ? "ies" : ""} created</li>
                  {rotations.length > 0 && (
                    <li>✓ Rotation set up</li>
                  )}
                </ul>
              </div>
              <p className="text-sm text-green-200">
                Redirecting to Today...
              </p>
            </div>
          </Card>

          {isLoading && (
            <Card>
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                <p className="text-sm">Planning your week...</p>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
