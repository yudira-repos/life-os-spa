import { db } from "@/lib/db";
import type { FilingStatus } from "@/lib/financialos/constants";
import {
  getCashflowSummary,
  getNetWorth,
  getMonthlyEssentialSpendCents,
  type CashflowSummary,
  type NetWorthBreakdown,
} from "@/lib/financialos/cashflow";
import type { VisibilityScope } from "@/lib/financialos/authz";
import type {
  EarnerProfile,
  FinancialProfile,
  HouseholdMember,
  InsurancePolicy,
  SavingsGoal,
} from "@/generated/prisma/client";

// Assembles everything the advice engine needs into one immutable snapshot.
//
// The engine takes this object and returns recommendations — it never queries
// the database itself. That's what makes the rules testable: you can hand the
// engine a hand-written context for "42-year-old couple in California, one
// 401k with a match, two kids, no emergency fund" and assert on exactly what
// comes back, with no database in the loop.

export interface EarnerContext {
  memberId: string;
  name: string;
  age: number | null;
  isPrimary: boolean;
  annualIncome: number; // dollars — salary + bonus
  selfEmployed: boolean;

  hasWorkplacePlan: boolean;
  planType: string;
  employerMatchPercent: number;
  employerMatchLimitPercent: number;
  currentDeferralPercent: number;
  currentDeferralIsRoth: boolean;
  currentDeferralDollars: number;
  planAllowsAfterTax: boolean;
  planAllowsInPlanRoth: boolean;
  planAllowsInServiceW: boolean;
  employerContribDollars: number;

  traditionalIraBalance: number;
  currentIraContrib: number;

  hsaEligible: boolean;
  hsaCoverage: "NONE" | "SELF" | "FAMILY";
  currentHsaContrib: number;
  employerHsaContrib: number;
}

export interface ChildContext {
  memberId: string;
  name: string;
  age: number | null;
  yearsToCollege: number | null;
}

export interface HouseholdFinancialContext {
  householdId: string;
  householdName: string;

  filingStatus: FilingStatus;
  stateCode: string;
  riskTolerance: string;
  financialLiteracy: string;
  emergencyFundMonthsTarget: number;
  hasWill: boolean;
  hasEstateBeneficiaries: boolean;
  highInterestDebt: number; // dollars
  highInterestDebtApr: number;

  earners: EarnerContext[];
  children: ChildContext[];
  hasSpouse: boolean;

  householdIncome: number; // dollars, gross
  /** Rough MAGI proxy: gross income less pre-tax deferrals and HSA. */
  estimatedMagi: number;

  netWorth: NetWorthBreakdown;
  cashflow: CashflowSummary;
  monthlyEssentialCents: number;
  monthlySurplusCents: number;

  goals: SavingsGoal[];
  policies: InsurancePolicy[];

  /** True when the profile has enough in it for the engine to say anything real. */
  profileComplete: boolean;
}

export function ageFromBirthdate(birthdate: Date | null): number | null {
  if (!birthdate) return null;
  return Math.floor(
    (Date.now() - birthdate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
}

const COLLEGE_START_AGE = 18;

function toEarnerContext(
  member: HouseholdMember & { earnerProfile: EarnerProfile | null },
  isPrimary: boolean
): EarnerContext {
  const profile = member.earnerProfile;
  const salary = (profile?.annualSalaryCents ?? 0) / 100;
  const bonus = (profile?.annualBonusCents ?? 0) / 100;
  const annualIncome = salary + bonus;

  return {
    memberId: member.id,
    name: member.name,
    age: ageFromBirthdate(member.birthdate),
    isPrimary,
    annualIncome,
    selfEmployed: profile?.selfEmployed ?? false,

    hasWorkplacePlan: profile?.hasWorkplacePlan ?? false,
    planType: profile?.planType ?? "NONE",
    employerMatchPercent: profile?.employerMatchPercent ?? 0,
    employerMatchLimitPercent: profile?.employerMatchLimitPercent ?? 0,
    currentDeferralPercent: profile?.currentDeferralPercent ?? 0,
    currentDeferralIsRoth: profile?.currentDeferralIsRoth ?? false,
    // Deferral percent applies to salary, not bonus — bonus deferral is a
    // separate election at most employers and we don't ask about it.
    currentDeferralDollars: (salary * (profile?.currentDeferralPercent ?? 0)) / 100,
    planAllowsAfterTax: profile?.planAllowsAfterTax ?? false,
    planAllowsInPlanRoth: profile?.planAllowsInPlanRoth ?? false,
    planAllowsInServiceW: profile?.planAllowsInServiceW ?? false,
    employerContribDollars: (profile?.employerContribCents ?? 0) / 100,

    traditionalIraBalance: (profile?.traditionalIraBalanceCents ?? 0) / 100,
    currentIraContrib: (profile?.currentIraContribCents ?? 0) / 100,

    hsaEligible: profile?.hsaEligible ?? false,
    hsaCoverage: (profile?.hsaCoverage as "NONE" | "SELF" | "FAMILY") ?? "NONE",
    currentHsaContrib: (profile?.currentHsaContribCents ?? 0) / 100,
    employerHsaContrib: (profile?.employerHsaContribCents ?? 0) / 100,
  };
}

export async function getFinancialProfile(householdId: string): Promise<FinancialProfile> {
  const existing = await db.financialProfile.findUnique({ where: { householdId } });
  if (existing) return existing;

  // Created lazily with defaults rather than at household creation, so
  // FinancialOS adds no rows for households that never enable it.
  return db.financialProfile.create({ data: { householdId } });
}

export async function buildFinancialContext(
  householdId: string,
  scope: VisibilityScope
): Promise<HouseholdFinancialContext> {
  const [household, profile] = await Promise.all([
    db.household.findUniqueOrThrow({ where: { id: householdId } }),
    getFinancialProfile(householdId),
  ]);

  const members = await db.householdMember.findMany({
    where: { householdId },
    include: { earnerProfile: true },
    orderBy: { createdAt: "asc" },
  });

  const adultMembers = members.filter((m) => m.role === "OWNER" || m.role === "ADULT");
  const childMembers = members.filter((m) => m.role === "CHILD");

  const earners = adultMembers.map((member, index) =>
    toEarnerContext(member, index === 0)
  );

  const children: ChildContext[] = childMembers.map((member) => {
    const age = ageFromBirthdate(member.birthdate);
    return {
      memberId: member.id,
      name: member.name,
      age,
      yearsToCollege: age == null ? null : Math.max(COLLEGE_START_AGE - age, 0),
    };
  });

  const [netWorth, cashflow, monthlyEssentialCents, goals, policies] = await Promise.all([
    getNetWorth(householdId, scope),
    getCashflowSummary(householdId, scope),
    getMonthlyEssentialSpendCents(householdId, scope),
    db.savingsGoal.findMany({
      where: { householdId },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    }),
    db.insurancePolicy.findMany({ where: { householdId } }),
  ]);

  const householdIncome = earners.reduce((sum, e) => sum + e.annualIncome, 0);
  const preTaxDeferrals = earners.reduce(
    (sum, e) => sum + (e.currentDeferralIsRoth ? 0 : e.currentDeferralDollars),
    0
  );
  const hsaContributions = earners.reduce((sum, e) => sum + e.currentHsaContrib, 0);

  // Deliberately a proxy, not a MAGI calculation. It's used to place the
  // household in a phase-out range; anyone near a boundary is told the number
  // is an estimate rather than being given a false yes/no.
  const estimatedMagi = Math.max(householdIncome - preTaxDeferrals - hsaContributions, 0);

  const monthlySurplusCents =
    cashflow.averageMonthlyIncomeCents - cashflow.averageMonthlyExpenseCents;

  return {
    householdId,
    householdName: household.name,

    filingStatus: profile.filingStatus as FilingStatus,
    stateCode: profile.stateCode,
    riskTolerance: profile.riskTolerance,
    financialLiteracy: profile.financialLiteracy,
    emergencyFundMonthsTarget: profile.emergencyFundMonthsTarget,
    hasWill: profile.hasWill,
    hasEstateBeneficiaries: profile.hasEstateBeneficiaries,
    highInterestDebt: profile.highInterestDebtCents / 100,
    highInterestDebtApr: profile.highInterestDebtApr,

    earners,
    children,
    hasSpouse: earners.length > 1,

    householdIncome,
    estimatedMagi,

    netWorth,
    cashflow,
    monthlyEssentialCents,
    monthlySurplusCents,

    goals,
    policies,

    profileComplete: householdIncome > 0 && earners.length > 0,
  };
}

/** The inputs the recommendation hash is computed over — see engine.ts. */
export function contextFingerprint(context: HouseholdFinancialContext) {
  return {
    filingStatus: context.filingStatus,
    stateCode: context.stateCode,
    householdIncome: Math.round(context.householdIncome),
    estimatedMagi: Math.round(context.estimatedMagi),
    earners: context.earners.map((e) => ({
      age: e.age,
      income: Math.round(e.annualIncome),
      plan: e.planType,
      match: e.employerMatchPercent,
      matchLimit: e.employerMatchLimitPercent,
      deferral: e.currentDeferralPercent,
      afterTax: e.planAllowsAfterTax,
      inPlanRoth: e.planAllowsInPlanRoth,
      inService: e.planAllowsInServiceW,
      iraBalance: Math.round(e.traditionalIraBalance),
      hsa: e.hsaCoverage,
      hsaContrib: Math.round(e.currentHsaContrib),
    })),
    children: context.children.map((c) => ({ age: c.age })),
    liquid: Math.round(context.netWorth.liquidCents / 100),
    essentialMonthly: Math.round(context.monthlyEssentialCents / 100),
    surplusMonthly: Math.round(context.monthlySurplusCents / 100),
    debt: Math.round(context.highInterestDebt),
    debtApr: context.highInterestDebtApr,
    policies: context.policies.map((p) => ({ type: p.type, coverage: p.coverageCents })),
  };
}
