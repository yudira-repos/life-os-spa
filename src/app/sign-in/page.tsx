"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <p className="text-3xl font-semibold tracking-tight">LifeOS</p>
        <p className="mt-2 max-w-sm text-sm text-neutral-400">
          One account, one household, one LifeOS — Kids, Fun, Property,
          Health, Travel, and Financial, all in one place.
        </p>
      </div>
      <Button onClick={() => signIn("google", { callbackUrl: "/" })}>
        Sign in with Google
      </Button>
    </div>
  );
}
