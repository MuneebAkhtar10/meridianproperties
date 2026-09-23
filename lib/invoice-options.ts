export const INVOICE_KINDS = ["service_charge", "additional"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  service_charge: "Service charge",
  additional: "Additional charge",
};

export const INVOICE_STATUSES = ["draft", "issued", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_BUCKETS = [
  "open",
  "billed",
  "unpaid",
  "overdue",
  "drafts",
  "paid",
  "all",
] as const;
export type InvoiceBucket = (typeof INVOICE_BUCKETS)[number];

export const INVOICE_DISPLAY_STATUSES = [
  "draft",
  "void",
  "paid",
  "partial",
  "overdue",
  "sent",
  "issued",
] as const;
export type InvoiceDisplayStatus = (typeof INVOICE_DISPLAY_STATUSES)[number];

export function isInvoiceKind(value: string | undefined): value is InvoiceKind {
  return INVOICE_KINDS.includes(value as InvoiceKind);
}

export function isInvoiceStatus(value: string | undefined): value is InvoiceStatus {
  return INVOICE_STATUSES.includes(value as InvoiceStatus);
}
