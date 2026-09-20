import type { ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatOmrAmount } from "@/lib/finance";
import { cn } from "@/lib/utils";

const STAT_TILE_COLORS = {
  blue: {
    bar: "bg-[#0886be]",
    badge: "bg-[#0886be]/10 text-[#0886be] ring-1 ring-inset ring-[#0886be]/15",
  },
  amber: {
    bar: "bg-amber-500",
    badge: "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-600/15",
  },
  emerald: {
    bar: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-600/15",
  },
  violet: {
    bar: "bg-violet-500",
    badge: "bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-600/15",
  },
  rose: {
    bar: "bg-rose-500",
    badge: "bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-600/15",
  },
  sky: {
    bar: "bg-[#0886be]",
    badge: "bg-[#0886be]/10 text-[#0886be] ring-1 ring-inset ring-[#0886be]/15",
  },
  teal: {
    bar: "bg-teal-500",
    badge: "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-600/15",
  },
} as const;

export type StatTileColor = keyof typeof STAT_TILE_COLORS;

export function TileMoney({ amount }: { amount: number }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground">
        OMR
      </span>
      <span>{formatOmrAmount(amount)}</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  href,
  color = "blue",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  href?: string;
  color?: StatTileColor;
}) {
  const palette = STAT_TILE_COLORS[color];
  const content = (
    <CardContent className="relative p-4 sm:p-5">
      <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${palette.bar}`} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase leading-snug tracking-wide text-muted-foreground">
          {label}
        </p>
        {icon && (
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${palette.badge}`}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 break-words text-[1.35rem] font-semibold leading-tight tracking-tight tabular-nums sm:text-xl lg:text-[1.375rem]">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p>
      )}
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        <Card className="h-full border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
          {content}
        </Card>
      </Link>
    );
  }

  return <Card className="border-border/60 shadow-sm">{content}</Card>;
}

export function PendingTaskRow({
  icon,
  label,
  count,
  href,
  amount,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  href: string;
  amount?: string;
}) {
  const clear = count === 0;
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5 transition-colors hover:bg-muted/50"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            clear ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
          }`}
        >
          {clear ? <CheckCircle2 className="h-4 w-4" /> : icon}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{label}</span>
          {amount && !clear && (
            <span className="text-[11px] text-muted-foreground">{amount}</span>
          )}
        </span>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
          clear ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"
        }`}
      >
        {clear ? "All clear" : count}
      </span>
    </Link>
  );
}

export function ShortcutTile({
  href,
  label,
  description,
  icon,
  iconClass,
}: {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
  iconClass: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          iconClass,
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{label}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </Link>
  );
}
