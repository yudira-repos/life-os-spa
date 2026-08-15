import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ModuleIcon } from "@/components/shell/module-icon";
import type { ModuleDefinition } from "@/lib/modules.config";

interface ModuleCardProps {
  module: ModuleDefinition;
  entitled: boolean;
  highlight?: string;
}

export function ModuleCard({ module, entitled, highlight }: ModuleCardProps) {
  const locked = !entitled;
  const comingSoon = module.status === "comingSoon";

  return (
    <Link href={module.route}>
      <Card className="flex h-full flex-col gap-3 transition-colors hover:border-white/20">
        <div className="flex items-center justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
            <ModuleIcon icon={module.icon} className="h-5 w-5" />
          </div>
          {locked && (
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
              🔒 Locked
            </span>
          )}
          {!locked && comingSoon && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
              Coming soon
            </span>
          )}
        </div>
        <p className="font-semibold">{module.name}</p>
        <p className="text-sm text-neutral-400">
          {highlight ?? module.tagline}
        </p>
      </Card>
    </Link>
  );
}
