import { clsx } from "clsx";
import { Card } from "@/components/ui/card";

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "positive" | "negative" | "accent";
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p
        className={clsx(
          "mt-2 text-2xl font-semibold tabular-nums",
          tone === "positive" && "text-emerald-300",
          tone === "negative" && "text-rose-300",
          tone === "accent" && "text-indigo-300"
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-neutral-500">{sub}</p>}
    </Card>
  );
}

/** A pure-CSS bar. No chart library for six bars — it wouldn't earn its bytes. */
export function BarRow({
  label,
  value,
  max,
  amount,
  tone = "accent",
}: {
  label: string;
  value: number;
  max: number;
  amount: string;
  tone?: "accent" | "positive" | "negative";
}) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 shrink-0 truncate text-neutral-400">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
        <div
          className={clsx(
            "h-full rounded-full",
            tone === "accent" && "bg-indigo-400/70",
            tone === "positive" && "bg-emerald-400/70",
            tone === "negative" && "bg-rose-400/70"
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="w-24 shrink-0 text-right tabular-nums text-neutral-300">
        {amount}
      </span>
    </div>
  );
}
