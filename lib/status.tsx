import {
  CheckCircle2,
  Clock,
  Hammer,
  Navigation,
  PauseCircle,
  type LucideIcon,
} from "lucide-react";

import type { Priority, RequestStatus } from "@/lib/generated/prisma/client";
import { cn } from "@/lib/utils";

/**
 * Every status and priority colour in the app is defined here and nowhere else.
 *
 * Each hue is reserved: amber only ever means pending, emerald only ever means
 * completed, and so on. No page may reuse them for decoration, otherwise the colours
 * stop carrying meaning.
 */

type StatusMeta = {
  label: string;
  icon: LucideIcon;
  /** Pill styling. */
  pill: string;
  /** Just the icon colour, for use outside a pill. */
  icon_color: string;
  /** Solid fill, for stat tiles and progress dots. */
  dot: string;
};

export const STATUS_META: Record<RequestStatus, StatusMeta> = {
  pending: {
    label: "Pending",
    icon: Clock,
    pill: "bg-amber-50 text-amber-700 ring-amber-600/20",
    icon_color: "text-amber-600",
    dot: "bg-amber-500",
  },
  en_route: {
    label: "En Route",
    icon: Navigation,
    pill: "bg-sky-50 text-sky-700 ring-sky-600/20",
    icon_color: "text-sky-600",
    dot: "bg-sky-500",
  },
  in_progress: {
    label: "In Progress",
    icon: Hammer,
    pill: "bg-violet-50 text-violet-700 ring-violet-600/20",
    icon_color: "text-violet-600",
    dot: "bg-violet-500",
  },
  on_hold: {
    label: "On Hold",
    icon: PauseCircle,
    pill: "bg-orange-50 text-orange-700 ring-orange-600/20",
    icon_color: "text-orange-600",
    dot: "bg-orange-500",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    icon_color: "text-emerald-600",
    dot: "bg-emerald-500",
  },
};

export const PRIORITY_META: Record<Priority, { label: string; pill: string }> =
  {
    low: {
      label: "Low",
      pill: "bg-slate-50 text-slate-600 ring-slate-500/20",
    },
    medium: {
      label: "Medium",
      pill: "bg-amber-50 text-amber-700 ring-amber-600/20",
    },
    high: {
      label: "High",
      // Deliberately the loudest pill in the app — urgent work must not blend in.
      pill: "bg-rose-100 text-rose-800 ring-rose-600/30",
    },
  };

/** The normal milestones. On Hold is an interrupt, not a forward step. */
export const STATUS_ORDER: RequestStatus[] = [
  "pending",
  "en_route",
  "in_progress",
  "completed",
];

const PILL_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset whitespace-nowrap";

export function StatusBadge({
  status,
  className,
}: {
  status: RequestStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span className={cn(PILL_BASE, meta.pill, className)}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  const meta = PRIORITY_META[priority];

  return (
    <span className={cn(PILL_BASE, meta.pill, className)}>
      {meta.label} priority
    </span>
  );
}
