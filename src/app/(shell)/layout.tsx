import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentHousehold } from "@/lib/session";
import { getEntitlements } from "@/lib/entitlements";
import { AppShell } from "@/components/shell/AppShell";

// Every route under (shell) — Home, all /app/* modules, Settings,
// Subscription — is gated here: no session -> sign in, session but no
// household yet -> onboarding. This is also where entitlements get loaded
// once and handed down, so nav locks match what each module page enforces.
export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const household = await getCurrentHousehold();
  if (!household) {
    redirect("/onboarding");
  }

  const entitlements = await getEntitlements(household.id);

  return (
    <AppShell
      householdName={household.name}
      userName={user.name ?? user.email}
      userImage={user.image}
      entitlements={entitlements}
    >
      {children}
    </AppShell>
  );
}
