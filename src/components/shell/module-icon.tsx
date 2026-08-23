import {
  Sparkles,
  Smile,
  Home,
  HeartPulse,
  Plane,
  Wallet,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import type { ModuleDefinition } from "@/lib/modules.config";

const ICONS: Record<ModuleDefinition["icon"], LucideIcon> = {
  sparkles: Sparkles,
  smile: Smile,
  home: Home,
  "heart-pulse": HeartPulse,
  plane: Plane,
  wallet: Wallet,
  "calendar-clock": CalendarClock,
};

export function ModuleIcon({ icon, className }: { icon: ModuleDefinition["icon"]; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon className={className} />;
}
