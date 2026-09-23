"use client";

import Link from "next/link";

import { formatMoneyCompact } from "@/lib/finance";
import { cn } from "@/lib/utils";

export function GroupedBarChart({
  months,
  rentHref,
  serviceChargeHref,
  expenseHref,
}: {
  months: { label: string; rent: number; serviceCharge: number; expenses?: number }[];
  rentHref?: string;
  serviceChargeHref?: string;
  expenseHref?: string;
}) {
  const showExpenses = months.some((month) => (month.expenses ?? 0) > 0);
  const peak = Math.max(
    1,
    ...months.flatMap((month) => [
      month.rent,
      month.serviceCharge,
      month.expenses ?? 0,
    ]),
  );

  return (
    <div className="space-y-3">
      <div className="flex h-48 items-end gap-2.5 sm:gap-3">
        {months.map((month) => (
          <div key={month.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-40 w-full items-end justify-center gap-0.5 sm:gap-1">
              <BarLink
                href={rentHref}
                title={`Rent ${formatMoneyCompact(month.rent)}`}
                className="bg-[#6366f1]"
                height={`${Math.max(4, (month.rent / peak) * 100)}%`}
                width={showExpenses ? "28%" : "42%"}
              />
              <BarLink
                href={serviceChargeHref}
                title={`Service charge ${formatMoneyCompact(month.serviceCharge)}`}
                className="bg-[#0ea5a4]"
                height={`${Math.max(4, (month.serviceCharge / peak) * 100)}%`}
                width={showExpenses ? "28%" : "42%"}
              />
              {showExpenses ? (
                <BarLink
                  href={expenseHref}
                  title={`Expenses ${formatMoneyCompact(month.expenses ?? 0)}`}
                  className="bg-amber-400"
                  height={`${Math.max(4, ((month.expenses ?? 0) / peak) * 100)}%`}
                  width="28%"
                />
              ) : null}
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">
              {month.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <LegendDot href={rentHref} color="#6366f1" label="Rent collected" />
        <LegendDot href={serviceChargeHref} color="#0ea5a4" label="Service charge" />
        {showExpenses ? (
          <LegendDot href={expenseHref} color="#fbbf24" label="Expenses" />
        ) : null}
      </div>
    </div>
  );
}

function BarLink({
  href,
  title,
  className,
  height,
  width,
}: {
  href?: string;
  title: string;
  className: string;
  height: string;
  width: string;
}) {
  const bar = (
    <span
      title={title}
      className={cn("block rounded-t-md transition-all", className, href && "hover:opacity-80")}
      style={{ height, width }}
    />
  );
  if (!href) return bar;
  return (
    <Link href={href} className="flex h-full items-end justify-center" style={{ width }} title={title}>
      <span
        className={cn("w-full rounded-t-md transition-all hover:opacity-80", className)}
        style={{ height }}
      />
    </Link>
  );
}

function LegendDot({
  href,
  color,
  label,
}: {
  href?: string;
  color: string;
  label: string;
}) {
  const body = (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
  if (!href) return body;
  return (
    <Link href={href} className="hover:text-foreground hover:underline">
      {body}
    </Link>
  );
}

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: { label: string; value: number; color: string; href?: string }[];
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
        {slices.map((slice) => {
          const row = (
            <span className="flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="truncate text-muted-foreground">{slice.label}</span>
              </span>
              <span className="font-medium tabular-nums">{slice.value}</span>
            </span>
          );
          return (
            <li key={slice.label}>
              {slice.href ? (
                <Link href={slice.href} className="block rounded-md px-0.5 hover:bg-muted/60">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SplitBar({
  left,
  right,
  leftLabel,
  rightLabel,
  leftHref,
  rightHref,
}: {
  left: number;
  right: number;
  leftLabel: string;
  rightLabel: string;
  leftHref?: string;
  rightHref?: string;
}) {
  const total = left + right;
  const leftPct = total > 0 ? (left / total) * 100 : 50;
  const leftBlock = (
    <div>
      <p className="text-muted-foreground">{leftLabel}</p>
      <p className="font-semibold tabular-nums">{formatMoneyCompact(left)}</p>
    </div>
  );
  const rightBlock = (
    <div className="text-right">
      <p className="text-muted-foreground">{rightLabel}</p>
      <p className="font-semibold tabular-nums">{formatMoneyCompact(right)}</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {leftHref ? (
          <Link
            href={leftHref}
            className="h-full bg-[#6366f1] hover:opacity-80"
            style={{ width: `${leftPct}%` }}
          />
        ) : (
          <div className="h-full bg-[#6366f1]" style={{ width: `${leftPct}%` }} />
        )}
        {rightHref ? (
          <Link href={rightHref} className="h-full flex-1 bg-[#0ea5a4] hover:opacity-80" />
        ) : (
          <div className="h-full flex-1 bg-[#0ea5a4]" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {leftHref ? (
          <Link href={leftHref} className="rounded-md hover:bg-muted/50">
            {leftBlock}
          </Link>
        ) : (
          leftBlock
        )}
        {rightHref ? (
          <Link href={rightHref} className="rounded-md hover:bg-muted/50">
            {rightBlock}
          </Link>
        ) : (
          rightBlock
        )}
      </div>
    </div>
  );
}

export function OccupancyBars({
  properties,
}: {
  properties: { id: string; name: string; occupied: number; units: number }[];
}) {
  if (properties.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">No properties yet.</p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {properties.map((property) => {
        const pct =
          property.units > 0
            ? Math.round((property.occupied / property.units) * 100)
            : 0;
        return (
          <li key={property.id}>
            <Link
              href={`/protected/properties/${property.id}`}
              className="block rounded-lg px-0.5 py-0.5 hover:bg-muted/50"
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium">{property.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {property.occupied}/{property.units} · {pct}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-violet-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
