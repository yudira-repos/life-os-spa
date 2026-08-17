import { daysBetween, startOfDay, today } from "@/lib/travelos/dates";

// The equipment registry — everything with a model number, a warranty, or a
// filter, including IoT devices.
//
// The point isn't inventory for its own sake. It's the three questions a
// homeowner can never answer when they need to: what size is the filter, is
// this still under warranty, and how old is it really. Each one costs money
// when unanswered — you buy the wrong filter, you pay for a repair a warranty
// would have covered, or you replace a water heater in an emergency instead of
// on your own schedule.

export type EquipmentKind =
  | "HVAC"
  | "WATER_HEATER"
  | "SOFTENER"
  | "RO_FILTER"
  | "REFRIGERATOR"
  | "WASHER"
  | "DRYER"
  | "DISHWASHER"
  | "GARAGE_DOOR"
  | "SOLAR"
  | "THERMOSTAT"
  | "CAMERA"
  | "DOORBELL"
  | "SENSOR"
  | "HUB"
  | "SMOKE_DETECTOR"
  | "SPRINKLER"
  | "OTHER";

export interface EquipmentKindMeta {
  label: string;
  emoji: string;
  isIot: boolean;
  /** Typical service life in years — for the "how old is it really" answer. */
  expectedLifeYears: number;
  /** Task template keys this equipment usually needs. */
  relatedTaskKeys: string[];
  /** What it costs to replace, roughly, so a failure isn't a surprise. */
  typicalReplacementCents: number;
}

export const EQUIPMENT_KINDS: Record<EquipmentKind, EquipmentKindMeta> = {
  HVAC: {
    label: "Furnace / AC",
    emoji: "🌡️",
    isIot: false,
    expectedLifeYears: 18,
    relatedTaskKeys: ["hvac_filter", "hvac_service", "hvac_condenser_clean"],
    typicalReplacementCents: 1_200_000,
  },
  WATER_HEATER: {
    label: "Water heater",
    emoji: "♨️",
    isIot: false,
    expectedLifeYears: 11,
    relatedTaskKeys: ["water_heater_flush", "water_heater_anode"],
    typicalReplacementCents: 220_000,
  },
  SOFTENER: {
    label: "Water softener",
    emoji: "🧂",
    isIot: false,
    expectedLifeYears: 14,
    relatedTaskKeys: ["softener_salt"],
    typicalReplacementCents: 180_000,
  },
  RO_FILTER: {
    label: "Water filter / RO system",
    emoji: "💧",
    isIot: false,
    expectedLifeYears: 12,
    relatedTaskKeys: ["ro_filter"],
    typicalReplacementCents: 45_000,
  },
  REFRIGERATOR: {
    label: "Refrigerator",
    emoji: "🧊",
    isIot: false,
    expectedLifeYears: 13,
    relatedTaskKeys: ["fridge_coils", "fridge_water_filter"],
    typicalReplacementCents: 180_000,
  },
  WASHER: {
    label: "Washing machine",
    emoji: "🫧",
    isIot: false,
    expectedLifeYears: 11,
    relatedTaskKeys: ["washer_hoses"],
    typicalReplacementCents: 90_000,
  },
  DRYER: {
    label: "Dryer",
    emoji: "🌀",
    isIot: false,
    expectedLifeYears: 13,
    relatedTaskKeys: ["dryer_vent"],
    typicalReplacementCents: 85_000,
  },
  DISHWASHER: {
    label: "Dishwasher",
    emoji: "🍽️",
    isIot: false,
    expectedLifeYears: 10,
    relatedTaskKeys: ["dishwasher_filter"],
    typicalReplacementCents: 80_000,
  },
  GARAGE_DOOR: {
    label: "Garage door opener",
    emoji: "🚪",
    isIot: false,
    expectedLifeYears: 15,
    relatedTaskKeys: [],
    typicalReplacementCents: 60_000,
  },
  SOLAR: {
    label: "Solar system",
    emoji: "☀️",
    isIot: true,
    expectedLifeYears: 25,
    relatedTaskKeys: [],
    typicalReplacementCents: 2_000_000,
  },
  THERMOSTAT: {
    label: "Smart thermostat",
    emoji: "🎛️",
    isIot: true,
    expectedLifeYears: 10,
    relatedTaskKeys: ["iot_firmware"],
    typicalReplacementCents: 25_000,
  },
  CAMERA: {
    label: "Security camera",
    emoji: "📹",
    isIot: true,
    expectedLifeYears: 6,
    relatedTaskKeys: ["iot_firmware", "iot_batteries", "iot_audit"],
    typicalReplacementCents: 15_000,
  },
  DOORBELL: {
    label: "Video doorbell",
    emoji: "🔔",
    isIot: true,
    expectedLifeYears: 6,
    relatedTaskKeys: ["iot_firmware", "iot_batteries"],
    typicalReplacementCents: 20_000,
  },
  SENSOR: {
    label: "Sensor (leak, door, motion)",
    emoji: "📡",
    isIot: true,
    expectedLifeYears: 7,
    relatedTaskKeys: ["iot_batteries"],
    typicalReplacementCents: 4_000,
  },
  HUB: {
    label: "Smart home hub",
    emoji: "🧠",
    isIot: true,
    expectedLifeYears: 7,
    relatedTaskKeys: ["iot_firmware", "iot_audit"],
    typicalReplacementCents: 12_000,
  },
  SMOKE_DETECTOR: {
    label: "Smoke / CO detector",
    emoji: "🚨",
    isIot: false,
    // Statutory, not a rule of thumb: the sensor degrades and units are
    // marked with a manufacture date for exactly this reason.
    expectedLifeYears: 10,
    relatedTaskKeys: ["smoke_alarm_test"],
    typicalReplacementCents: 5_000,
  },
  SPRINKLER: {
    label: "Irrigation controller",
    emoji: "🚿",
    isIot: true,
    expectedLifeYears: 10,
    relatedTaskKeys: ["irrigation_check", "iot_firmware"],
    typicalReplacementCents: 30_000,
  },
  OTHER: {
    label: "Other",
    emoji: "🔧",
    isIot: false,
    expectedLifeYears: 10,
    relatedTaskKeys: [],
    typicalReplacementCents: 0,
  },
};

export type EquipmentHealth = "OK" | "AGING" | "PAST_LIFE" | "WARRANTY_EXPIRING" | "UNKNOWN";

export interface EquipmentAssessment {
  health: EquipmentHealth;
  ageYears: number | null;
  lifeFraction: number | null;
  warrantyDaysLeft: number | null;
  headline: string;
  advice: string[];
}

/**
 * How worried to be about a piece of equipment.
 *
 * "Past its expected life" is not "broken" — plenty of water heaters run for
 * twenty years. It means the failure is now plausible enough to plan for
 * rather than be surprised by, which is the difference between choosing a
 * replacement and taking whatever can be installed tomorrow.
 */
export function assessEquipment(params: {
  kind: string;
  installedOn: Date | null;
  warrantyExpiresOn: Date | null;
  expectedLifeYears: number | null;
  now?: Date;
}): EquipmentAssessment {
  const now = startOfDay(params.now ?? today());
  const meta = EQUIPMENT_KINDS[params.kind as EquipmentKind] ?? EQUIPMENT_KINDS.OTHER;
  const expectedLife = params.expectedLifeYears ?? meta.expectedLifeYears;

  const ageYears = params.installedOn
    ? daysBetween(params.installedOn, now) / 365.25
    : null;

  const warrantyDaysLeft = params.warrantyExpiresOn
    ? daysBetween(now, params.warrantyExpiresOn)
    : null;

  const lifeFraction = ageYears != null && expectedLife > 0 ? ageYears / expectedLife : null;
  const advice: string[] = [];

  if (warrantyDaysLeft != null && warrantyDaysLeft > 0 && warrantyDaysLeft <= 90) {
    advice.push(
      `Warranty expires in ${warrantyDaysLeft} days. If anything has been not-quite-right, this is the moment to raise it — not next month.`
    );
  }
  if (warrantyDaysLeft != null && warrantyDaysLeft <= 0) {
    advice.push("Out of warranty. A home warranty plan may be worth pricing against the replacement cost.");
  }

  if (lifeFraction != null && lifeFraction >= 1) {
    advice.push(
      `Past its typical ${expectedLife}-year life. Not a reason to replace it today, but worth getting a quote now so a failure is a decision rather than an emergency — replacement runs around $${Math.round(meta.typicalReplacementCents / 100).toLocaleString()}.`
    );
  } else if (lifeFraction != null && lifeFraction >= 0.75) {
    advice.push(
      `About ${Math.round(lifeFraction * 100)}% through its typical life. Worth starting a replacement fund.`
    );
  }

  if (params.kind === "SMOKE_DETECTOR" && ageYears != null && ageYears >= 10) {
    advice.push(
      "Smoke detectors have a hard 10-year life — the sensor degrades regardless of the battery. Replace the unit, not the battery."
    );
  }

  if (meta.isIot) {
    advice.push(
      "Internet-connected: keep firmware current and remove it from the network if you stop using it."
    );
  }

  let health: EquipmentHealth = "UNKNOWN";
  let headline = "Add an install date to track its age and remaining life.";

  if (warrantyDaysLeft != null && warrantyDaysLeft > 0 && warrantyDaysLeft <= 90) {
    health = "WARRANTY_EXPIRING";
    headline = `Warranty expires in ${warrantyDaysLeft} days.`;
  } else if (lifeFraction != null && lifeFraction >= 1) {
    health = "PAST_LIFE";
    headline = `${ageYears!.toFixed(0)} years old — past the typical ${expectedLife}-year life.`;
  } else if (lifeFraction != null && lifeFraction >= 0.75) {
    health = "AGING";
    headline = `${ageYears!.toFixed(0)} years old, of a typical ${expectedLife}.`;
  } else if (lifeFraction != null) {
    health = "OK";
    headline = `${ageYears!.toFixed(0)} years old, of a typical ${expectedLife}.`;
  }

  return { health, ageYears, lifeFraction, warrantyDaysLeft, headline, advice };
}

export const HEALTH_LABELS: Record<EquipmentHealth, string> = {
  OK: "Fine",
  AGING: "Aging",
  PAST_LIFE: "Past its life",
  WARRANTY_EXPIRING: "Warranty ending",
  UNKNOWN: "Age unknown",
};

/** Replacement reserve: what a year of aging costs across everything owned. */
export function annualDepreciationCents(
  equipment: { kind: string; expectedLifeYears: number | null }[]
): number {
  return equipment.reduce((sum, item) => {
    const meta = EQUIPMENT_KINDS[item.kind as EquipmentKind] ?? EQUIPMENT_KINDS.OTHER;
    const life = item.expectedLifeYears ?? meta.expectedLifeYears;
    if (life <= 0 || meta.typicalReplacementCents <= 0) return sum;
    return sum + Math.round(meta.typicalReplacementCents / life);
  }, 0);
}

// --- Vendors ---------------------------------------------------------------

export type VendorTrade =
  | "GARDENER"
  | "PLUMBER"
  | "HANDYMAN"
  | "ELECTRICIAN"
  | "HVAC"
  | "PEST"
  | "CLEANER"
  | "ROOFER"
  | "POOL"
  | "APPLIANCE"
  | "OTHER";

export const TRADE_LABELS: Record<VendorTrade, string> = {
  GARDENER: "Gardener / landscaper",
  PLUMBER: "Plumber",
  HANDYMAN: "Handyman",
  ELECTRICIAN: "Electrician",
  HVAC: "HVAC technician",
  PEST: "Pest control",
  CLEANER: "Cleaner",
  ROOFER: "Roofer",
  POOL: "Pool service",
  APPLIANCE: "Appliance repair",
  OTHER: "Other",
};

export const TRADE_EMOJI: Record<VendorTrade, string> = {
  GARDENER: "🌿",
  PLUMBER: "🔧",
  HANDYMAN: "🔨",
  ELECTRICIAN: "⚡",
  HVAC: "🌡️",
  PEST: "🐜",
  CLEANER: "🧹",
  ROOFER: "🏠",
  POOL: "🏊",
  APPLIANCE: "🔌",
  OTHER: "📋",
};

/**
 * The trades worth having a number for BEFORE you need one. Finding a plumber
 * at 11pm with water coming through the ceiling is how people end up paying
 * triple for whoever answers.
 */
export const ESSENTIAL_TRADES: VendorTrade[] = ["PLUMBER", "ELECTRICIAN", "HVAC", "HANDYMAN"];
