import type { ReactNode } from "react";
import { Locked } from "@/components/shell/Locked";
import { PropertySubNav } from "@/components/propertyos/PropertySubNav";
import { requirePropertyAccess } from "@/lib/propertyos/authz";

export default async function PropertyLayout({ children }: { children: ReactNode }) {
  const access = await requirePropertyAccess();

  if (!access.ok) {
    if (access.reason === "NOT_ENTITLED") return <Locked moduleName="PropertyOS" />;
    if (access.reason === "NOT_A_MANAGER") {
      return (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
          <p className="text-4xl">🏠</p>
          <p className="text-lg font-semibold">You&apos;re not a member of this household yet.</p>
          <p className="text-sm text-neutral-400">
            Ask whoever set up LifeOS to add you in Settings.
          </p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <PropertySubNav />
      {children}
    </div>
  );
}
