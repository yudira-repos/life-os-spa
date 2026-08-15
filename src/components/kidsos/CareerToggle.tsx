"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CareerToggle({
  childId,
  careerKey,
  bookmarked,
}: {
  childId: string;
  careerKey: string;
  bookmarked: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    await fetch("/api/kids/careers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId, careerKey, action: bookmarked ? "remove" : "add" }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <Button
      variant={bookmarked ? "secondary" : "ghost"}
      className="!px-2.5 !py-1 text-xs"
      disabled={pending}
      onClick={toggle}
    >
      {bookmarked ? "★ Saved" : "☆ Save"}
    </Button>
  );
}
