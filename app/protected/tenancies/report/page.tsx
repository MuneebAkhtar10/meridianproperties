import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Download, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, moneyValue } from "@/lib/finance";
import { getTenantReportData } from "@/lib/tenant-report";
import { requireAnyRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export default async function TenantReportPage({ searchParams }: PageProps) {
  const user = await requireAnyRole(UserType.admin, UserType.owner);

  const params = (await searchParams) as unknown as { property?: string };
  const propertyId = typeof params.property === "string" ? params.property : "";

  if (!propertyId) {
    notFound();
  }

  const report = await getTenantReportData(propertyId, user);
  if (!report) {
    notFound();
  }

  const totalMonthlyRent = report.rows.reduce(
    (sum, row) => sum + moneyValue(row.rentPerMonth),
    0,
  );
  const pdfHref = `/api/tenancies/report-pdf?property=${propertyId}`;

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Tenant Report"
        description={report.propertyName}
        back={{ href: "/protected/tenancies", label: "All tenancies" }}
      >
        <a href={pdfHref} className={buttonVariants({ variant: "outline" })}>
          <Download className="h-4 w-4" />
          Download PDF
        </a>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Card className="relative overflow-hidden border-border/60 shadow-sm">
          <span className="absolute inset-x-0 top-0 h-1 bg-primary" />
          <CardContent className="flex items-start gap-2 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold leading-tight">
                {report.rows.length}
              </p>
              <p className="text-xs leading-snug text-muted-foreground">
                Active tenancies
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-border/60 shadow-sm">
          <span className="absolute inset-x-0 top-0 h-1 bg-emerald-500" />
          <CardContent className="flex items-start gap-2 p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Users className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold leading-tight">
                {formatMoney(totalMonthlyRent)}
              </p>
              <p className="text-xs leading-snug text-muted-foreground">
                Scheduled monthly rent
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {report.rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No active tenants in this property"
          description="Once a tenancy starts here, it'll show up in this report."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Tenant Name</th>
                  <th className="px-3 py-2.5 font-medium">Contact</th>
                  <th className="px-3 py-2.5 font-medium">Area</th>
                  <th className="px-3 py-2.5 font-medium">Agreement No.</th>
                  <th className="px-3 py-2.5 font-medium">Building Name / No</th>
                  <th className="px-3 py-2.5 font-medium">Unit No</th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    Rent Per Month
                  </th>
                  <th className="px-3 py-2.5 font-medium">Agr. Start Date</th>
                  <th className="px-3 py-2.5 font-medium">Agr. End Date</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {report.rows.map((row, index) => (
                  <tr key={index} className="hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-medium">{row.tenantName}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {row.contact}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {row.area}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {row.agreementNo}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {row.buildingName}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {row.unitNo}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">
                      {formatMoney(row.rentPerMonth)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {format(row.startDate, "dd/MM/yyyy")}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {row.leaseEndDate
                        ? format(row.leaseEndDate, "dd/MM/yyyy")
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
