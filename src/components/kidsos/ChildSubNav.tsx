"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

export function ChildSubNav({ childId, childName }: { childId: string; childName: string }) {
  const pathname = usePathname();
  const base = `/app/kids/${childId}`;
  const tabs = [
    { href: base, label: "Today" },
    { href: `${base}/study`, label: "Study" },
    { href: `${base}/activities`, label: "Activities" },
    { href: `${base}/careers`, label: "Careers" },
    { href: `${base}/progress`, label: "Progress" },
  ];

  return (
    <div className="mb-6">
      <Link href="/app/kids" className="text-xs text-neutral-500 hover:text-neutral-300">
        ← All kids
      </Link>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{childName}</p>
      <nav className="mt-4 flex flex-wrap gap-1 border-b border-white/10 pb-px">
        {tabs.map((tab) => {
          const active = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "rounded-t-lg px-4 py-2 text-sm font-medium transition-colors",
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
