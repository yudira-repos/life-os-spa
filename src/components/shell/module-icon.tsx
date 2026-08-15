import { Sparkles, Smile, Home, HeartPulse, Plane, Wallet, type LucideIcon } from "lucide-react";
import type { ModuleDefinition } from "@/lib/modules.config";

const ICONS: Record<ModuleDefinition["icon"], LucideIcon> = {
  sparkles: Sparkles,
  smile: Smile,
  home: Home,
  "heart-pulse": HeartPulse,
  plane: Plane,
  wallet: Wallet,
};

export function ModuleIcon({ icon, className }: { icon: ModuleDefinition["icon"]; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon className={className} />;
}
