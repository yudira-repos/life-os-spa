import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { ProfileForm } from "@/components/financialos/ProfileForm";
import { EarnerForm } from "@/components/financialos/EarnerForm";
import { requireFinancialAccess, getHouseholdAdults } from "@/lib/financialos/authz";
import { getFinancialProfile } from "@/lib/financialos/profile";

export default async function SetupPage() {
  const access = await requireFinancialAccess();
  if (!access.ok) return null;
  const { household } = access;

  const [profile, adults] = await Promise.all([
    getFinancialProfile(household.id),
    getHouseholdAdults(household.id),
  ]);

  const earnerProfiles = await db.earnerProfile.findMany({
    where: { memberId: { in: adults.map((a) => a.id) } },
  });
  const byMember = new Map(earnerProfiles.map((e) => [e.memberId, e]));

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-indigo-400/20 bg-indigo-500/5">
        <p className="font-semibold">Why we ask for all this</p>
        <p className="mt-2 text-sm text-neutral-400">
          The plan is calculated, not guessed. Whether the Mega Backdoor Roth is
          available to you depends entirely on three specific features of your
          employer&apos;s plan; whether a Backdoor Roth costs you money depends on
          your existing pre-tax IRA balance. None of that is visible in a bank
          feed, so we ask rather than assume — and where we don&apos;t know, the
          plan says so instead of inventing an answer.
        </p>
      </Card>

      <ProfileForm
        initial={{
          filingStatus: profile.filingStatus,
          stateCode: profile.stateCode,
          emergencyFundMonthsTarget: profile.emergencyFundMonthsTarget,
          riskTolerance: profile.riskTolerance,
          financialLiteracy: profile.financialLiteracy,
          hasWill: profile.hasWill,
          hasEstateBeneficiaries: profile.hasEstateBeneficiaries,
          highInterestDebtCents: profile.highInterestDebtCents,
          highInterestDebtApr: profile.highInterestDebtApr,
        }}
      />

      {adults.map((adult) => {
        const earner = byMember.get(adult.id);
        return (
          <EarnerForm
            key={adult.id}
            initial={{
              memberId: adult.id,
              memberName: adult.name,
              annualSalaryCents: earner?.annualSalaryCents ?? 0,
              annualBonusCents: earner?.annualBonusCents ?? 0,
              selfEmployed: earner?.selfEmployed ?? false,
              hasWorkplacePlan: earner?.hasWorkplacePlan ?? false,
              planType: earner?.planType ?? "401K",
              employerMatchPercent: earner?.employerMatchPercent ?? 0,
              employerMatchLimitPercent: earner?.employerMatchLimitPercent ?? 0,
              currentDeferralPercent: earner?.currentDeferralPercent ?? 0,
              currentDeferralIsRoth: earner?.currentDeferralIsRoth ?? false,
              planAllowsAfterTax: earner?.planAllowsAfterTax ?? false,
              planAllowsInPlanRoth: earner?.planAllowsInPlanRoth ?? false,
              planAllowsInServiceW: earner?.planAllowsInServiceW ?? false,
              employerContribCents: earner?.employerContribCents ?? 0,
              traditionalIraBalanceCents: earner?.traditionalIraBalanceCents ?? 0,
              currentIraContribCents: earner?.currentIraContribCents ?? 0,
              hsaEligible: earner?.hsaEligible ?? false,
              hsaCoverage: earner?.hsaCoverage ?? "NONE",
              currentHsaContribCents: earner?.currentHsaContribCents ?? 0,
              employerHsaContribCents: earner?.employerHsaContribCents ?? 0,
            }}
          />
        );
      })}

      <Card>
        <p className="font-semibold">Household members</p>
        <p className="mt-1 text-sm text-neutral-400">
          Adults get their own income and retirement plan section here. Children
          with a birthdate let the plan project college costs and size life
          insurance — they can never see any of this data themselves.
        </p>
        <Link
          href="/settings"
          className="mt-3 inline-block text-sm text-indigo-300 underline underline-offset-2"
        >
          Manage members in Settings →
        </Link>
      </Card>
    </div>
  );
}
