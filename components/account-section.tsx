import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TONES = {
  violet: "bg-violet-50 text-violet-600",
  indigo: "bg-indigo-50 text-indigo-600",
  sky: "bg-sky-50 text-sky-600",
  amber: "bg-amber-50 text-amber-600",
  slate: "bg-slate-100 text-slate-600",
} as const;

/**
 * One clearly bounded block inside an expanded account card — a white card
 * with its own header strip (tinted icon, title, optional subtitle/action),
 * so stacked sections (profile, properties, documents, password) read as
 * separate things instead of running together on the same faint background.
 */
export function AccountSection({
  icon,
  title,
  subtitle,
  action,
  tone = "slate",
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  tone?: keyof typeof TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&>svg]:h-4 [&>svg]:w-4",
              TONES[tone],
            )}
          >
            {icon}
          </span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">{title}</h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {action}
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}
