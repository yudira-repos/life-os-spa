"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const TABS = [
  { href: "/app/property", label: "Overview" },
  { href: "/app/property/bills", label: "Bills" },
  { href: "/app/property/maintenance", label: "Maintenance" },
  { href: "/app/property/equipment", label: "Equipment" },
  { href: "/app/property/vendors", label: "Vendors" },
  { href: "/app/property/settings", label: "Property" },
];

export function PropertySubNav() {
  const pathname = usePathname();
  const base = "/app/property";

  return (
    <div className="mb-6">
      <p className="text-2xl font-semibold tracking-tight">PropertyOS</p>
      <p className="mt-1 text-sm text-neutral-400">
        Everything the house needs, before it becomes urgent.
      </p>
      <nav className="mt-4 flex flex-wrap gap-1 border-b border-white/10 pb-px">
        {TABS.map((tab) => {
          const active =
            tab.href === base ? pathname === base : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "rounded-t-lg px-3.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-b-2 border-indigo-400 text-indigo-300"
                  : "text-neutral-400 hover:text-neutral-100"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
