// The module registry — the one place that knows what OS modules exist.
// The Shell's nav and the Home dashboard render FROM this array, nothing
// hardcoded. Adding a new module (e.g. CareerOS) later means adding one
// entry here plus a route folder — not touching the Shell.
//
// "status: comingSoon" modules are fully wired into nav/registry/entitlement
// checks today; they just don't have real functionality behind them yet.

export type ModuleStatus = "live" | "comingSoon";

export type ModuleId =
  | "kids"
  | "fun"
  | "property"
  | "health"
  | "travel"
  | "financial";

export interface ModuleDefinition {
  id: ModuleId;
  name: string;
  route: string;
  tagline: string;
  icon: "sparkles" | "smile" | "home" | "heart-pulse" | "plane" | "wallet";
  status: ModuleStatus;
}

export const MODULES: ModuleDefinition[] = [
  {
    id: "kids",
    name: "KidsOS",
    route: "/app/kids",
    tagline: "Learning, activities, and growth for every child.",
    icon: "sparkles",
    status: "live",
  },
  {
    id: "fun",
    name: "FunOS",
    route: "/app/fun",
    tagline: "Help the family intentionally spend time together.",
    icon: "smile",
    status: "live",
  },
  {
    id: "property",
    name: "PropertyOS",
    route: "/app/property",
    tagline: "Maintenance, repairs, and finances for your home.",
    icon: "home",
    status: "comingSoon",
  },
  {
    id: "health",
    name: "HealthOS",
    route: "/app/health",
    tagline: "Family health records and healthy-lifestyle guidance.",
    icon: "heart-pulse",
    status: "comingSoon",
  },
  {
    id: "travel",
    name: "TravelOS",
    route: "/app/travel",
    tagline: "Plan trips around your family's real availability.",
    icon: "plane",
    status: "comingSoon",
  },
  {
    id: "financial",
    name: "FinancialOS",
    route: "/app/financial",
    tagline: "Net worth, retirement, and the household financial plan.",
    icon: "wallet",
    status: "comingSoon",
  },
];

export function getModule(id: string): ModuleDefinition | undefined {
  return MODULES.find((m) => m.id === id);
}

// Modules included in the FREE plan, seeded automatically for every new household.
export const FREE_MODULES: ModuleId[] = ["kids", "fun"];
