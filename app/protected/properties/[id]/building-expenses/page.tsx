import { format } from "date-fns";
import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button-link";
import { formatMoney } from "@/lib/finance";
import { getBuildingExpensesData } from "@/lib/building-expenses";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

/**
 * Spec #33 "Building Management Expenses" — Unit | Description | Amount,
 * per unit, for one property. The richer Date/Supplier/Category/Receipt/
 * Paid By/Notes stay visible per line as evidence if an owner questions
 * an expense, exactly as the spec asks.
 */
export default async function BuildingExpensesPage({ params }: PageProps) {
  await requireRole(UserType.admin);

  const { id: propertyId } = (await params) as { id: string };
  const data = await getBuildingExpensesData(propertyId);
  if (!data) {
    notFound();
  }

  const grandTotal = data.groups.reduce((sum, g) => sum + g.total, 0);

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Building Management Expenses"
        description={data.propertyName}
        back={{
          href: `/protected/properties/${propertyId}`,
          label: "Back to property",
        }}
      >
        <ButtonLink
          href={`/api/properties/${propertyId}/building-expenses/pdf`}
          target="_blank"
          variant="outline"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </ButtonLink>
      </PageHeader>

      {data.groups.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No unit-scoped expenses yet"
          description="Log an expense against specific units on the Expenses page and it'll show up here, grouped by unit."
        />
      ) : (
        <>
          {data.groups.map((group) => (
            <Card key={group.unitId} className="overflow-hidden">
              <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
                <h3 className="text-sm font-semibold">{group.unitLabel}</h3>
                <span className="text-sm font-semibold text-rose-600">
                  {formatMoney(group.total)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Supplier</th>
                      <th className="px-3 py-2">Paid By</th>
                      <th className="px-3 py-2">Reference</th>
                      <th className="px-3 py-2">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {group.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2 align-top">
                          <div>{line.description}</div>
                          {line.notes && (
                            <div className="text-xs text-muted-foreground">
                              {line.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right align-top font-medium">
                          {formatMoney(line.amount)}
                        </td>
                        <td className="px-3 py-2 align-top text-muted-foreground">
                          {format(line.date, "d MMM yyyy")}
                        </td>
                        <td className="px-3 py-2 align-top text-muted-foreground">
                          {line.categoryLabel}
                        </td>
                        <td className="px-3 py-2 align-top text-muted-foreground">
                          {line.supplierLabel}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {line.paidBy === "owner" ? (
                            <span className="inline-flex items-center rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20">
                              Owner
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Management</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top text-muted-foreground">
                          {line.paymentReference ?? "—"}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {line.receiptHref ? (
                            <a
                              href={line.receiptHref}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-primary hover:underline"
                            >
                              View
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          <Card>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Grand total
              </span>
              <span className="text-lg font-semibold text-rose-600">
                {formatMoney(grandTotal)}
              </span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
