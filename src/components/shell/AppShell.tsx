"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { clsx } from "clsx";
import { LayoutGrid, Settings, CreditCard, LogOut } from "lucide-react";
import { MODULES } from "@/lib/modules.config";
import { ModuleIcon } from "@/components/shell/module-icon";

interface AppShellProps {
  householdName: string;
  userName: string;
  userImage?: string | null;
  entitlements: Record<string, boolean>;
  children: React.ReactNode;
}

export function AppShell({
  householdName,
  userName,
  userImage,
  entitlements,
  children,
}: AppShellProps) {
  const pathname = usePathname();

  const navLink = (href: string, label: string, icon: React.ReactNode) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={clsx(
          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-indigo-500/15 text-indigo-300"
            : "text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
        )}
      >
        {icon}
        {label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 p-4 md:flex">
        <div className="mb-6 px-2">
          <p className="text-lg font-semibold tracking-tight">LifeOS</p>
          <p className="text-xs text-neutral-500">{householdName}</p>
        </div>

        <nav className="flex flex-col gap-1">
          {navLink("/", "Home", <LayoutGrid className="h-4 w-4" />)}
        </nav>

        <p className="mt-6 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
          Modules
        </p>
        <nav className="flex flex-col gap-1">
          {MODULES.map((m) => {
            const locked = !entitlements[m.id];
            return (
              <Link
                key={m.id}
                href={m.route}
                className={clsx(
                  "flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  pathname === m.route
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
                )}
              >
                <span className="flex items-center gap-3">
                  <ModuleIcon icon={m.icon} className="h-4 w-4" />
                  {m.name}
                </span>
                {locked && <span className="text-[10px] text-neutral-600">🔒</span>}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-1 pt-6">
          {navLink("/settings", "Settings", <Settings className="h-4 w-4" />)}
          {navLink("/subscription", "Subscription", <CreditCard className="h-4 w-4" />)}
          <button
            onClick={() => signOut({ callbackUrl: "/sign-in" })}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-white/10 px-2 pt-4">
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userImage} alt="" className="h-7 w-7 rounded-full" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-indigo-500/30" />
          )}
          <span className="truncate text-sm text-neutral-300">{userName}</span>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
