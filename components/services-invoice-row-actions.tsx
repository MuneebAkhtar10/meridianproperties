"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Tooltip } from "@/components/ui/tooltip";

const compactBtn =
  "h-8 min-w-8 shrink-0 px-2.5 text-xs [&_svg]:size-3.5";

export function ServicesInvoiceRowActions({
  invoiceId,
  invoiceNumber,
  status,
}: {
  invoiceId: string;
  invoiceNumber: number;
  status: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const paid = status === "paid";

  async function setStatus(next: "paid" | "issued") {
    setPending(true);
    try {
      const response = await fetch(`/api/services-invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) throw new Error("Could not update invoice.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function deleteInvoice() {
    const confirmed = window.confirm(
      `Delete invoice #${invoiceNumber}? This cannot be undone.`,
    );
    if (!confirmed) return;
    setPending(true);
    try {
      const response = await fetch(`/api/services-invoices/${invoiceId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not delete invoice.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
      <ButtonLink
        href={`/api/services-invoices/${invoiceId}`}
        target="_blank"
        variant="outline"
        size="sm"
        className={compactBtn}
      >
        <Download />
        PDF
      </ButtonLink>
      {paid ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setStatus("issued")}
          className={compactBtn}
        >
          Mark unpaid
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => setStatus("paid")}
          className={compactBtn}
        >
          Mark paid
        </Button>
      )}
      <Tooltip label="Delete invoice" side="top">
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          disabled={pending}
          onClick={deleteInvoice}
          aria-label={`Delete invoice #${invoiceNumber}`}
          className="h-8 w-8 text-muted-foreground hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
    </div>
  );
}
