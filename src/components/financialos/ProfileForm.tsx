"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseMoneyToCents, formatCents } from "@/lib/financialos/money";
import {
  FILING_STATUS_LABELS,
  STATE_TOP_MARGINAL_RATE,
} from "@/lib/financialos/constants";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-400/60";
const labelClass = "text-xs font-medium text-neutral-400";

export interface ProfileFormValues {
  filingStatus: string;
  stateCode: string;
  emergencyFundMonthsTarget: number;
  riskTolerance: string;
  financialLiteracy: string;
  hasWill: boolean;
  hasEstateBeneficiaries: boolean;
  highInterestDebtCents: number;
  highInterestDebtApr: number;
}

export function ProfileForm({ initial }: { initial: ProfileFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [debtInput, setDebtInput] = useState(
    initial.highInterestDebtCents > 0 ? formatCents(initial.highInterestDebtCents) : ""
  );
  const [aprInput, setAprInput] = useState(
    initial.highInterestDebtApr > 0 ? (initial.highInterestDebtApr * 100).toFixed(1) : ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/financial/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        highInterestDebtCents: parseMoneyToCents(debtInput) ?? 0,
        highInterestDebtApr: (Number(aprInput) || 0) / 100,
      }),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  const states = Object.keys(STATE_TOP_MARGINAL_RATE).sort();

  return (
    <Card>
      <p className="font-semibold">Household</p>
      <p className="mt-1 text-sm text-neutral-400">
        Tax facts the plan can&apos;t work out from your bank accounts.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Filing status</label>
          <select
            className={inputClass}
            value={values.filingStatus}
            onChange={(e) => set("filingStatus", e.target.value)}
          >
            {Object.entries(FILING_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>State</label>
          <select
            className={inputClass}
            value={values.stateCode}
            onChange={(e) => set("stateCode", e.target.value)}
          >
            {states.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-neutral-600">
            Drives state tax savings and whether your 529 gets a deduction.
          </p>
        </div>

        <div>
          <label className={labelClass}>Emergency fund target (months)</label>
          <input
            type="number"
            min={1}
            max={24}
            className={inputClass}
            value={values.emergencyFundMonthsTarget}
            onChange={(e) => set("emergencyFundMonthsTarget", Number(e.target.value))}
          />
          <p className="mt-1 text-[11px] text-neutral-600">
            3 with two stable incomes, 6 standard, 12 if income is variable.
          </p>
        </div>

        <div>
          <label className={labelClass}>Risk tolerance</label>
          <select
            className={inputClass}
            value={values.riskTolerance}
            onChange={(e) => set("riskTolerance", e.target.value)}
          >
            <option value="CONSERVATIVE">Conservative</option>
            <option value="MODERATE">Moderate</option>
            <option value="AGGRESSIVE">Aggressive</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>How comfortable are you with this stuff?</label>
          <select
            className={inputClass}
            value={values.financialLiteracy}
            onChange={(e) => set("financialLiteracy", e.target.value)}
          >
            <option value="BEGINNER">Never been taught any of it — explain everything</option>
            <option value="LEARNING">I know the basics but I&apos;m not confident</option>
            <option value="CONFIDENT">I&apos;m comfortable — skip the definitions</option>
          </select>
          <p className="mt-1 text-[11px] text-neutral-600">
            Changes how much the plan explains, never what it recommends.
          </p>
        </div>

        <div>
          <label className={labelClass}>High-interest debt not linked here</label>
          <input
            className={inputClass}
            placeholder="$0"
            value={debtInput}
            onChange={(e) => {
              setDebtInput(e.target.value);
              setSaved(false);
            }}
          />
        </div>

        <div>
          <label className={labelClass}>Its interest rate (APR %)</label>
          <input
            className={inputClass}
            placeholder="22.0"
            value={aprInput}
            onChange={(e) => {
              setAprInput(e.target.value);
              setSaved(false);
            }}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={values.hasWill}
            onChange={(e) => set("hasWill", e.target.checked)}
          />
          We have a will
        </label>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={values.hasEstateBeneficiaries}
            onChange={(e) => set("hasEstateBeneficiaries", e.target.checked)}
          />
          Beneficiaries are set on all accounts
        </label>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save household details"}
        </Button>
        {saved && <span className="text-xs text-emerald-300">Saved.</span>}
      </div>
    </Card>
  );
}
