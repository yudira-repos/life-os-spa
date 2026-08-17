"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseMoneyToCents, formatCents } from "@/lib/financialos/money";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60";
const labelClass = "text-xs font-medium text-neutral-400";

export interface EarnerFormValues {
  memberId: string;
  memberName: string;
  annualSalaryCents: number;
  annualBonusCents: number;
  selfEmployed: boolean;
  hasWorkplacePlan: boolean;
  planType: string;
  employerMatchPercent: number;
  employerMatchLimitPercent: number;
  currentDeferralPercent: number;
  currentDeferralIsRoth: boolean;
  planAllowsAfterTax: boolean;
  planAllowsInPlanRoth: boolean;
  planAllowsInServiceW: boolean;
  employerContribCents: number;
  traditionalIraBalanceCents: number;
  currentIraContribCents: number;
  hsaEligible: boolean;
  hsaCoverage: string;
  currentHsaContribCents: number;
  employerHsaContribCents: number;
}

function MoneyField({
  label,
  cents,
  onChange,
  hint,
}: {
  label: string;
  cents: number;
  onChange: (cents: number) => void;
  hint?: string;
}) {
  const [text, setText] = useState(cents > 0 ? formatCents(cents) : "");
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        className={inputClass}
        placeholder="$0"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseMoneyToCents(e.target.value) ?? 0);
        }}
      />
      {hint && <p className="mt-1 text-[11px] text-neutral-600">{hint}</p>}
    </div>
  );
}

export function EarnerForm({ initial }: { initial: EarnerFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof EarnerFormValues>(key: K, value: EarnerFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/financial/earners/${values.memberId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <Card>
      <p className="font-semibold">{values.memberName}</p>
      <p className="mt-1 text-sm text-neutral-400">
        Income and workplace plan details.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <MoneyField
          label="Annual salary"
          cents={values.annualSalaryCents}
          onChange={(cents) => set("annualSalaryCents", cents)}
        />
        <MoneyField
          label="Annual bonus / RSUs"
          cents={values.annualBonusCents}
          onChange={(cents) => set("annualBonusCents", cents)}
        />

        <label className="flex items-center gap-2 text-sm text-neutral-300 sm:col-span-2">
          <input
            type="checkbox"
            checked={values.selfEmployed}
            onChange={(e) => set("selfEmployed", e.target.checked)}
          />
          Self-employed or 1099
        </label>
      </div>

      <div className="mt-6 border-t border-white/5 pt-5">
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-200">
          <input
            type="checkbox"
            checked={values.hasWorkplacePlan}
            onChange={(e) => set("hasWorkplacePlan", e.target.checked)}
          />
          Has a workplace retirement plan
        </label>

        {values.hasWorkplacePlan && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Plan type</label>
              <select
                className={inputClass}
                value={values.planType}
                onChange={(e) => set("planType", e.target.value)}
              >
                <option value="401K">401(k)</option>
                <option value="403B">403(b)</option>
                <option value="457B">457(b)</option>
                <option value="SIMPLE_IRA">SIMPLE IRA</option>
                <option value="SEP_IRA">SEP IRA</option>
                <option value="SOLO_401K">Solo 401(k)</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>You contribute (% of salary)</label>
              <input
                type="number"
                step="0.5"
                className={inputClass}
                value={values.currentDeferralPercent}
                onChange={(e) => set("currentDeferralPercent", Number(e.target.value))}
              />
            </div>

            <div>
              <label className={labelClass}>Employer matches (%)</label>
              <input
                type="number"
                step="1"
                className={inputClass}
                value={values.employerMatchPercent}
                onChange={(e) => set("employerMatchPercent", Number(e.target.value))}
              />
              <p className="mt-1 text-[11px] text-neutral-600">
                &quot;50% match&quot; → enter 50.
              </p>
            </div>

            <div>
              <label className={labelClass}>…up to (% of your pay)</label>
              <input
                type="number"
                step="0.5"
                className={inputClass}
                value={values.employerMatchLimitPercent}
                onChange={(e) => set("employerMatchLimitPercent", Number(e.target.value))}
              />
              <p className="mt-1 text-[11px] text-neutral-600">
                &quot;up to 6% of pay&quot; → enter 6.
              </p>
            </div>

            <MoneyField
              label="Employer contributions per year"
              cents={values.employerContribCents}
              onChange={(cents) => set("employerContribCents", cents)}
              hint="Match plus any profit sharing. Used for the Mega Backdoor headroom."
            />

            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={values.currentDeferralIsRoth}
                onChange={(e) => set("currentDeferralIsRoth", e.target.checked)}
              />
              Contributing as Roth (not pre-tax)
            </label>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
                Mega Backdoor Roth eligibility
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Call your plan administrator and ask: &quot;Does the plan permit
                after-tax, non-Roth contributions above the elective deferral
                limit, and does it allow in-plan Roth conversions?&quot; These
                three answers decide whether the strategy is available — we
                don&apos;t guess at them.
              </p>
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={values.planAllowsAfterTax}
                    onChange={(e) => set("planAllowsAfterTax", e.target.checked)}
                  />
                  Plan allows after-tax (non-Roth) contributions
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={values.planAllowsInPlanRoth}
                    onChange={(e) => set("planAllowsInPlanRoth", e.target.checked)}
                  />
                  Plan allows in-plan Roth conversion
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={values.planAllowsInServiceW}
                    onChange={(e) => set("planAllowsInServiceW", e.target.checked)}
                  />
                  Plan allows in-service withdrawals
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 border-t border-white/5 pt-5 sm:grid-cols-2">
        <MoneyField
          label="Pre-tax traditional IRA balance"
          cents={values.traditionalIraBalanceCents}
          onChange={(cents) => set("traditionalIraBalanceCents", cents)}
          hint="This is what makes a Backdoor Roth expensive — the pro-rata rule."
        />
        <MoneyField
          label="IRA contributions this year"
          cents={values.currentIraContribCents}
          onChange={(cents) => set("currentIraContribCents", cents)}
        />
      </div>

      <div className="mt-6 border-t border-white/5 pt-5">
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-200">
          <input
            type="checkbox"
            checked={values.hsaEligible}
            onChange={(e) => set("hsaEligible", e.target.checked)}
          />
          On an HSA-eligible high-deductible health plan
        </label>

        {values.hsaEligible && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Coverage</label>
              <select
                className={inputClass}
                value={values.hsaCoverage}
                onChange={(e) => set("hsaCoverage", e.target.value)}
              >
                <option value="NONE">None</option>
                <option value="SELF">Self only</option>
                <option value="FAMILY">Family</option>
              </select>
            </div>
            <MoneyField
              label="Your HSA contributions per year"
              cents={values.currentHsaContribCents}
              onChange={(cents) => set("currentHsaContribCents", cents)}
            />
            <MoneyField
              label="Employer HSA contribution"
              cents={values.employerHsaContribCents}
              onChange={(cents) => set("employerHsaContribCents", cents)}
            />
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : `Save ${values.memberName}'s details`}
        </Button>
        {saved && <span className="text-xs text-emerald-300">Saved.</span>}
      </div>
    </Card>
  );
}
