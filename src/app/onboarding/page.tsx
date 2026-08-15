import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentHousehold } from "@/lib/session";
import { OnboardingForm } from "@/app/onboarding/onboarding-form";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const existing = await getCurrentHousehold();
  if (existing) {
    redirect("/");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-8 px-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight">
          Welcome, {user.name?.split(" ")[0] ?? "there"}.
        </p>
        <p className="mt-2 text-sm text-neutral-400">
          Set up your household, then LifeOS is ready to use — you can add
          more family members any time from Settings.
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
