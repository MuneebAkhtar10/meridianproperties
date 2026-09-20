"use client";

import { formatMoneyCompact } from "@/lib/finance";
import { cn } from "@/lib/utils";

export function GroupedBarChart({
  months,
}: {
  months: { label: string; rent: number; serviceCharge: number }[];
}) {
  const peak = Math.max(
    1,
    ...months.flatMap((month) => [month.rent, month.serviceCharge]),
  );

  return (
    <div className="space-y-3">
      <div className="flex h-44 items-end gap-3">
        {months.map((month) => (
          <div key={month.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-36 w-full items-end justify-center gap-1">
              <div
                title={`Rent ${formatMoneyCompact(month.rent)}`}
                className="w-[42%] rounded-t-md bg-[#6366f1] transition-all"
                style={{ height: `${Math.max(4, (month.rent / peak) * 100)}%` }}
              />
              <div
                title={`Service charge ${formatMoneyCompact(month.serviceCharge)}`}
                className="w-[42%] rounded-t-md bg-[#0ea5a4] transition-all"
                style={{
                  height: `${Math.max(4, (month.serviceCharge / peak) * 100)}%`,
                }}
              />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">
              {month.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[#6366f1]" />
          Rent collected
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[#0ea5a4]" />
          Service charge collected
        </span>
      </div>
    </div>
  );
}

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: { label: string; value: number; color: string }[];
  centerLabel: string;
  centerValue: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-[7.5rem] w-[7.5rem] shrink-0">
        <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="10"
          />
          {slices.map((slice) => {
            const length = (slice.value / total) * circumference;
            const circle = (
              <circle
                key={slice.label}
                cx="48"
                cy="48"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="10"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += length;
            return circle;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-lg font-semibold leading-none tracking-tight">
            {centerValue}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {centerLabel}
          </p>
        </div>
      </div>
      <ul className="min-w-0 space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              <span className="truncate text-muted-foreground">{slice.label}</span>
            </span>
            <span className="font-medium tabular-nums">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SplitBar({
  left,
  right,
  leftLabel,
  rightLabel,
}: {
  left: number;
  right: number;
  leftLabel: string;
  rightLabel: string;
}) {
  const total = left + right;
  const leftPct = total > 0 ? (left / total) * 100 : 50;

  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full bg-[#6366f1]")}
          style={{ width: `${leftPct}%` }}
        />
        <div className="h-full flex-1 bg-[#0ea5a4]" />
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">{leftLabel}</p>
          <p className="font-semibold tabular-nums">{formatMoneyCompact(left)}</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground">{rightLabel}</p>
          <p className="font-semibold tabular-nums">{formatMoneyCompact(right)}</p>
        </div>
      </div>
    </div>
  );
}
