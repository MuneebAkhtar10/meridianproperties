import { Download, Plus, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";

import {
  addBudgetExpenseLineAction,
  addBudgetIncomeLineAction,
  deleteBudgetExpenseLineAction,
  deleteBudgetIncomeLineAction,
} from "@/app/budget-actions";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { PendingFieldset } from "@/components/pending-fieldset";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ButtonLink } from "@/components/ui/button-link";
import { Button } from "@/components/ui/button";
import { YearPicker } from "@/components/year-picker";
import { formatMoney, moneyValue } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { requireAnyRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

/** Spec's own budget-heading categories, offered as suggestions (not a
 * fixed enum) so an admin can still type something new. */
const BUDGET_EXPENSE_CATEGORIES = [
  "Building Cleaning",
  "Administration of Owners Association",
  "Supervisor",
  "Common Water Bill",
  "Common Area Residential Electricity Bill",
  "Pest Control",
  "Building Insurance",
  "Security System",
  "Fire System",
  "Elevator Maintenance",
  "General Maintenance",
  "Cleaning Items",
  "Air Conditioning – General Area",
  "Swimming Pool",
  "Gym Services",
  "Accounting Services/Software",
  "Sinking Fund",
  "Other approved expenditure",
];

const currentYear = () => new Date().getFullYear();

export default async function AnnualBudgetPage({ params, searchParams }: PageProps) {
  const { id: propertyId, year: yearParam } = await params;
  const message = (await searchParams) as Message;
  const year = Number(yearParam);

  if (!Number.isInteger(year)) {
    notFound();
  }

  const user = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = user.userType === UserType.owner;

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      name: true,
      units: { select: { ownerId: true } },
    },
  });
  if (!property) {
    notFound();
  }
  if (isOwner && !property.units.some((u) => u.ownerId === user.id)) {
    notFound();
  }

  const budget = await prisma.annualBudget.findUnique({
    where: { propertyId_year: { propertyId, year } },
    include: {
      incomeLines: { orderBy: { description: "asc" } },
      expenseLines: {
        orderBy: { description: "asc" },
        include: { fund: { select: { label: true } } },
      },
    },
  });

  const funds = await prisma.fund.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true },
  });

  const incomeLines = budget?.incomeLines ?? [];
  const expenseLines = budget?.expenseLines ?? [];

  const totalIncome = incomeLines.reduce(
    (sum, line) => sum + moneyValue(line.totalYearly),
    0,
  );
  const totalExpenseYearly = expenseLines.reduce(
    (sum, line) => sum + moneyValue(line.ratePerYear),
    0,
  );
  const totalExpenseMonthly = expenseLines.reduce(
    (sum, line) => sum + moneyValue(line.ratePerMonth),
    0,
  );

  const years = Array.from({ length: 6 }, (_, i) => currentYear() - 2 + i);

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Annual Budget"
        description={`${property.name} · Financial year ${year}`}
        back={{
          href: `/protected/properties/${propertyId}`,
          label: "Back to property",
        }}
      >
        <div className="flex items-center gap-2">
          <YearPicker
            basePath={`/protected/properties/${propertyId}/budget`}
            year={year}
            years={years}
          />
          <ButtonLink
            href={`/api/properties/${propertyId}/budget/${year}/pdf`}
            target="_blank"
            variant="outline"
            size="sm"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </ButtonLink>
        </div>
      </PageHeader>

      <FormMessage message={message} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Income</CardTitle>
          <span className="text-sm font-semibold text-emerald-600">
            {formatMoney(totalIncome)} / year
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">No of Units</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Total Yearly</th>
                  {!isOwner && <th className="w-10 px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {incomeLines.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-sm text-muted-foreground"
                    >
                      No income lines yet.
                    </td>
                  </tr>
                ) : (
                  incomeLines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2">{line.description}</td>
                      <td className="px-3 py-2 text-right">{line.units}</td>
                      <td className="px-3 py-2 text-right">
                        {formatMoney(line.amount)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatMoney(line.totalYearly)}
                      </td>
                      {!isOwner && (
                        <td className="px-3 py-2 text-right">
                          <form action={deleteBudgetIncomeLineAction}>
                            <input type="hidden" name="id" value={line.id} />
                            <input type="hidden" name="propertyId" value={propertyId} />
                            <input type="hidden" name="year" value={year} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isOwner && (
            <form
              action={addBudgetIncomeLineAction}
              className="rounded-lg border p-3"
            >
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="year" value={year} />
              <PendingFieldset className="grid gap-2 sm:grid-cols-[1fr_120px_140px_auto]">
                <Input name="description" placeholder="Description" required />
                <Input
                  name="units"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="No of units"
                  required
                />
                <Input
                  name="amount"
                  type="number"
                  min="0.001"
                  step="0.001"
                  placeholder="Amount per unit"
                  required
                />
                <SubmitButton size="sm" pendingText="Adding...">
                  <Plus className="h-4 w-4" />
                  Add
                </SubmitButton>
              </PendingFieldset>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Expenditure</CardTitle>
          <span className="text-sm font-semibold text-rose-600">
            {formatMoney(totalExpenseYearly)} / year (
            {formatMoney(totalExpenseMonthly)} / month)
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Fund</th>
                  <th className="px-3 py-2 text-right">Rate/Month</th>
                  <th className="px-3 py-2 text-right">Rate/Year</th>
                  {!isOwner && <th className="w-10 px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {expenseLines.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-sm text-muted-foreground"
                    >
                      No expenditure lines yet.
                    </td>
                  </tr>
                ) : (
                  expenseLines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2">{line.description}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {line.fund?.label ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatMoney(line.ratePerMonth)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatMoney(line.ratePerYear)}
                      </td>
                      {!isOwner && (
                        <td className="px-3 py-2 text-right">
                          <form action={deleteBudgetExpenseLineAction}>
                            <input type="hidden" name="id" value={line.id} />
                            <input type="hidden" name="propertyId" value={propertyId} />
                            <input type="hidden" name="year" value={year} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!isOwner && (
            <form
              action={addBudgetExpenseLineAction}
              className="rounded-lg border p-3"
            >
              <input type="hidden" name="propertyId" value={propertyId} />
              <input type="hidden" name="year" value={year} />
              <datalist id="budget-expense-categories">
                {BUDGET_EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <PendingFieldset className="grid gap-2 sm:grid-cols-[1.5fr_1fr_140px_auto]">
                <Input
                  name="description"
                  placeholder="Description"
                  list="budget-expense-categories"
                  required
                />
                <Select name="fundId" defaultValue="">
                  <option value="">No fund</option>
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                <Input
                  name="ratePerMonth"
                  type="number"
                  min="0.001"
                  step="0.001"
                  placeholder="Rate / month"
                  required
                />
                <SubmitButton size="sm" pendingText="Adding...">
                  <Plus className="h-4 w-4" />
                  Add
                </SubmitButton>
              </PendingFieldset>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Net (Income − Expenditure)
          </span>
          <span
            className={
              totalIncome - totalExpenseYearly >= 0
                ? "text-lg font-semibold text-emerald-600"
                : "text-lg font-semibold text-rose-600"
            }
          >
            {formatMoney(totalIncome - totalExpenseYearly)}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
