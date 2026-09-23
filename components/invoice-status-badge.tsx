import { cn } from "@/lib/utils";
import type { InvoiceDisplayStatus } from "@/lib/invoice-options";

const STYLES: Record<InvoiceDisplayStatus, string> = {
  draft: "bg-slate-50 text-slate-700 ring-slate-600/20",
  issued: "bg-sky-50 text-sky-800 ring-sky-600/20",
  sent: "bg-indigo-50 text-indigo-800 ring-indigo-600/20",
  partial: "bg-amber-50 text-amber-800 ring-amber-600/20",
  overdue: "bg-red-50 text-red-800 ring-red-600/20",
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  void: "bg-muted text-muted-foreground ring-border",
};

const LABELS: Record<InvoiceDisplayStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  sent: "Sent",
  partial: "Partial",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceDisplayStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ring-inset",
        STYLES[status],
      )}
    >
      {LABELS[status]}
    </span>
  );
}
