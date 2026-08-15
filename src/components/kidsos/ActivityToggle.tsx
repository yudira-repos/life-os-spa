"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ActivityToggle({
  childId,
  activityKey,
  status,
}: {
  childId: string;
  activityKey: string;
  status: "INTERESTED" | "ACTIVE" | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function setStatus(next: "INTERESTED" | "ACTIVE" | "REMOVE") {
    setPending(true);
    await fetch("/api/kids/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId, activityKey, status: next }),
    });
    setPending(false);
    router.refresh();
  }

  if (status === "ACTIVE") {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
          Doing this
        </span>
        <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={pending} onClick={() => setStatus("REMOVE")}>
          Remove
        </Button>
      </div>
    );
  }

  if (status === "INTERESTED") {
    return (
      <div className="flex items-center gap-2">
        <Button variant="secondary" className="!px-2.5 !py-1 text-xs" disabled={pending} onClick={() => setStatus("ACTIVE")}>
          Mark as doing
        </Button>
        <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={pending} onClick={() => setStatus("REMOVE")}>
          Remove
        </Button>
      </div>
    );
  }

  return (
    <Button variant="ghost" className="!px-2.5 !py-1 text-xs" disabled={pending} onClick={() => setStatus("INTERESTED")}>
      Interested
    </Button>
  );
}
