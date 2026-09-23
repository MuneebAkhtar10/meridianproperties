"use client";

import { useState } from "react";
import { FileText, List, Plus } from "lucide-react";

import { ServicesInvoiceModal, type ServicesInvoiceUnitOption } from "@/components/services-invoice-modal";
import { Button } from "@/components/ui/button";
import { PendingLink } from "@/components/ui/pending-link";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function ToolbarIcon({
  icon: Icon,
  className,
}: {
  icon: typeof FileText;
  className: string;
}) {
  return (
    <span className={`flex items-center justify-center rounded-md p-1 ${className}`}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function ServicesInvoiceMenu({
  propertyId,
  units,
}: {
  propertyId: string;
  units: ServicesInvoiceUnitOption[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative">
      <Tooltip label="Invoices for this property’s expenses and rent collection. Generate a new one, or open the list of issued invoices (mark paid, download PDF).">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-background"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <ToolbarIcon icon={FileText} className="bg-sky-100 text-sky-700" />
          Services Invoice
        </Button>
      </Tooltip>

      {menuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
      )}
      <div
        className={cn(
          "absolute left-0 z-50 mt-1.5 w-64 space-y-1 rounded-lg border border-border/60 bg-card p-1.5 shadow-lg",
          menuOpen ? "block" : "hidden",
        )}
      >
        <ServicesInvoiceModal
          propertyId={propertyId}
          units={units}
          trigger={
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
            >
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block">Generate invoice</span>
                <span className="block text-[11px] font-normal text-muted-foreground">
                  Expenses and rent received for a unit
                </span>
              </span>
            </button>
          }
        />
        <PendingLink
          href={`/protected/properties/${propertyId}/services-invoices`}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted"
          onClick={() => setMenuOpen(false)}
        >
          <List className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block">View all invoices</span>
            <span className="block text-[11px] font-normal text-muted-foreground">
              Issued invoices — mark paid, download, or delete
            </span>
          </span>
        </PendingLink>
      </div>
    </div>
  );
}
