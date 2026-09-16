"use client";

import { ChevronDown, Download, FileDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button-variants";

/**
 * Collapses the Expenses page's CSV/PDF export links into one "Export"
 * menu — keeps the page header from turning into a wall of same-weight
 * pill buttons once "Expense Types" and "Cash Flow Statement" (navigation
 * actions, not exports) sit next to it. The Cash Flow Statement itself is
 * its own modal (components/cash-flow-statement-modal.tsx), not a plain
 * href, since it needs a Property/Fund/From/To form first.
 */
export function ExpensesExportMenu({
  csvHref,
  pdfHref,
}: {
  csvHref: string;
  pdfHref: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: "outline" })}>
        <Download className="h-4 w-4" />
        Export
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <a href={csvHref} className="cursor-pointer">
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={pdfHref} className="cursor-pointer">
            <FileDown className="mr-2 h-4 w-4" />
            Download PDF
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
