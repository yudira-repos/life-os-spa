"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

// Setup is a sequence, and the order is not arbitrary: an activity needs a
// place, a rotation needs people, and the carpool group needs the rotations.
// Listing the pages in that order is the closest thing to instructions the
// product can give without a wizard telling you what to do next.
const TABS = [
  { href: "/app/day", label: "Today", exact: true },
  { href: "/app/day/places", label: "Places" },
  { href: "/app/day/people", label: "People" },
  { href: "/app/day/rotations", label: "Rotations" },
  { href: "/app/day/activities", label: "Activities" },
  { href: "/app/day/carpool", label: "Carpool" },
];

export default function DayLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <nav className="border-b border-white/5 px-6">
        <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={clsx(
                  "whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors",
                  active
                    ? "border-indigo-400 text-neutral-100"
                    : "border-transparent text-neutral-500 hover:text-neutral-300"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
      {children}
    </div>
  );
}
