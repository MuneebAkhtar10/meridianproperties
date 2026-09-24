import { format } from "date-fns";
import {
  ArrowLeft,
  Building2,
  FileText,
  Plus,
  Receipt,
  Tags,
  Wallet,
  X,
} from "lucide-react";

import { deleteExpenseAction } from "@/app/expense-actions";
import {
  createExpenseCategoryAction,
  createExpenseSubcategoryAction,
  deleteExpenseCategoryAction,
  deleteExpenseSubcategoryAction,
} from "@/app/expense-type-actions";
import { EmptyState } from "@/components/empty-state";
import { ExpenseEditModal } from "@/components/expense-edit-modal";
import { LogExpenseForm } from "@/components/log-expense-form";
import { ExpensesExportMenu } from "@/components/expenses-export-menu";
import { CashFlowStatementModal } from "@/components/cash-flow-statement-modal";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { UploadFileInput } from "@/components/upload-file-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button-link";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingLink } from "@/components/ui/pending-link";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  buildExpenseWhere,
  getActiveSuppliersWithCategories,
  getExpenseCategoriesWithSubcategories,
} from "@/lib/expenses";
import { dateInputValue, formatMoney, moneyValue } from "@/lib/finance";
import { collectsServiceCharge, formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export default async function ExpensesPage({ searchParams }: PageProps) {
  await requireRole(UserType.admin);

  const rawParams = (await searchParams) as unknown as {
    tab?: string;
    category?: string;
    property?: string;
    year?: string;
    cashflow?: string;
  } & Message;
  const message = rawParams as Message;
  const tab = rawParams.tab === "types" ? "types" : "log";
  const categoryFilter =
    typeof rawParams.category === "string" ? rawParams.category : "all";
  const propertyFilter =
    typeof rawParams.property === "string" ? rawParams.property : "all";
  const yearFilter = typeof rawParams.year === "string" ? rawParams.year : "all";

  const where = buildExpenseWhere({
    category: categoryFilter,
    property: propertyFilter,
    year: yearFilter,
  });

  const dateRange = await prisma.expense.aggregate({
    _min: { date: true },
    _max: { date: true },
  });
  const currentYear = new Date().getUTCFullYear();
  const earliestYear = dateRange._min.date?.getUTCFullYear() ?? currentYear;
  const latestYear = Math.max(
    dateRange._max.date?.getUTCFullYear() ?? currentYear,
    currentYear,
  );
  const years = Array.from(
    { length: latestYear - earliestYear + 1 },
    (_, i) => latestYear - i,
  );

  const [
    expenses,
    properties,
    units,
    totals,
    categoryBreakdown,
    categories,
    suppliers,
    categoryUsageCounts,
    subcategoryUsageCounts,
    funds,
  ] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        category: { select: { id: true, label: true } },
        supplier: { select: { id: true, companyName: true } },
        fund: { select: { id: true, label: true } },
        property: {
          select: {
            name: true,
            propertyType: { select: { name: true, isOwnerAssociation: true } },
          },
        },
        units: {
          include: {
            unit: {
              select: {
                label: true,
                propertyId: true,
                property: {
                  select: {
                    name: true,
                    propertyType: {
                      select: {
                        name: true,
                        unitPrefix: true,
                        hasFloors: true,
                        isOwnerAssociation: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.property.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        propertyType: {
          select: {
            name: true,
            isOwnerAssociation: true,
            isBuildingManagement: true,
            showRentBills: true,
            showMaintenance: true,
            hasCommonAreas: true,
          },
        },
      },
    }),
    prisma.unit.findMany({
      orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
      select: {
        id: true,
        label: true,
        propertyId: true,
        property: {
          select: {
            name: true,
            propertyType: { select: { unitPrefix: true, hasFloors: true } },
          },
        },
      },
    }),
    prisma.expense.aggregate({
      where,
      _sum: { amount: true },
      _count: true,
    }),
    prisma.expense.groupBy({
      by: ["categoryId"],
      where,
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: "desc" } },
    }),
    getExpenseCategoriesWithSubcategories(),
    getActiveSuppliersWithCategories(),
    prisma.expense.groupBy({ by: ["categoryId"], _count: true }),
    prisma.expense.groupBy({ by: ["categoryId", "subcategory"], _count: true }),
    prisma.fund.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, label: true },
    }),
  ]);

  const categoryLabelById = new Map(categories.map((c) => [c.id, c.label]));
  const expenseCountByCategory = new Map(
    categoryUsageCounts.map((row) => [row.categoryId, row._count]),
  );
  const expenseCountBySubcategory = new Map(
    subcategoryUsageCounts
      .filter((row) => row.subcategory !== null)
      .map((row) => [`${row.categoryId}|${row.subcategory}`, row._count]),
  );

  const unitOptions = units.map((unit) => ({
    id: unit.id,
    propertyId: unit.propertyId,
    label: formatUnitLabel(unit.property.propertyType, unit.label),
  }));

  const exportQuery = new URLSearchParams();
  if (categoryFilter !== "all") exportQuery.set("category", categoryFilter);
  if (propertyFilter !== "all") exportQuery.set("property", propertyFilter);
  if (yearFilter !== "all") exportQuery.set("year", yearFilter);
  const exportQs = exportQuery.toString() ? `?${exportQuery}` : "";
  const exportCsvHref = `/api/expenses/export${exportQs}`;
  const exportPdfHref = `/api/expenses/export-pdf${exportQs}`;

  const noServiceChargeById = new Map(
    properties.map((property) => [
      property.id,
      !collectsServiceCharge(property.propertyType),
    ]),
  );

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title={tab === "types" ? "Expense Types" : "Expenses"}
        description={
          tab === "types"
            ? "Categories and subcategories used to classify every logged expense."
            : "Money spent from the service charge, logged against a property or unit."
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {tab === "log" ? (
            <>
              <ExpensesExportMenu csvHref={exportCsvHref} pdfHref={exportPdfHref} />
              <CashFlowStatementModal
                properties={properties}
                defaultPropertyId={
                  propertyFilter !== "all" ? propertyFilter : undefined
                }
                autoOpen={rawParams.cashflow === "1"}
              />
              <PendingLink
                href="/protected/expenses?tab=types"
                className={buttonVariants({ variant: "secondary" })}
              >
                <Tags className="h-4 w-4" />
                Expense Types
              </PendingLink>
            </>
          ) : (
            <PendingLink
              href="/protected/expenses"
              className={buttonVariants({ variant: "outline" })}
            >
              <ArrowLeft className="h-4 w-4" />
              Log & History
            </PendingLink>
          )}
        </div>
      </PageHeader>

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      {tab === "types" ? (
        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="min-w-0 space-y-4">
            {categories.length === 0 ? (
              <EmptyState
                icon={Tags}
                title="No expense categories yet"
                description="Add your first category using the form."
              />
            ) : (
              categories.map((category) => {
                const expenseCount = expenseCountByCategory.get(category.id) ?? 0;

                return (
                  <Card key={category.id}>
                    <CardContent className="space-y-4 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-semibold">{category.label}</h3>
                          <p className="text-sm text-muted-foreground">
                            {expenseCount} expense{expenseCount === 1 ? "" : "s"}{" "}
                            using this category
                          </p>
                        </div>
                        <form>
                          <input type="hidden" name="categoryId" value={category.id} />
                          <span
                            title={
                              expenseCount > 0
                                ? "Remove or recategorize its expenses first"
                                : undefined
                            }
                          >
                            <SubmitButton
                              formAction={deleteExpenseCategoryAction}
                              variant="ghost"
                              size="sm"
                              pendingText="Deleting..."
                              className="text-muted-foreground hover:text-destructive"
                              disabled={expenseCount > 0}
                            >
                              Delete category
                            </SubmitButton>
                          </span>
                        </form>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Types
                        </p>
                        {category.subcategories.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No types yet — add one below.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {category.subcategories.map((subcategory) => {
                              const inUse =
                                expenseCountBySubcategory.get(
                                  `${category.id}|${subcategory.label}`,
                                ) ?? 0;
                              return (
                                <form
                                  key={subcategory.id}
                                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                                >
                                  <input
                                    type="hidden"
                                    name="subcategoryId"
                                    value={subcategory.id}
                                  />
                                  {subcategory.label}
                                  <button
                                    type="submit"
                                    formAction={deleteExpenseSubcategoryAction}
                                    disabled={inUse > 0}
                                    title={
                                      inUse > 0
                                        ? "Remove or recategorize its expenses first"
                                        : `Remove ${subcategory.label}`
                                    }
                                    className="text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </form>
                              );
                            })}
                          </div>
                        )}

                        <form className="flex items-center gap-2 pt-1">
                          <input type="hidden" name="categoryId" value={category.id} />
                          <Input
                            name="label"
                            placeholder="Add a type…"
                            className="h-8 max-w-56 text-xs"
                            required
                          />
                          <SubmitButton
                            formAction={createExpenseSubcategoryAction}
                            variant="outline"
                            size="sm"
                            pendingText="Adding..."
                          >
                            Add
                          </SubmitButton>
                        </form>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          <Card className="h-fit lg:sticky lg:top-24">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4" />
                Add a category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-category-label">Name</Label>
                  <Input
                    id="new-category-label"
                    name="label"
                    placeholder="e.g. Landscaping"
                    required
                  />
                </div>
                <SubmitButton
                  formAction={createExpenseCategoryAction}
                  className="w-full"
                  pendingText="Adding..."
                >
                  Add category
                </SubmitButton>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <StatTile
              icon={<Wallet className="h-4 w-4" />}
              value={formatMoney(totals._sum.amount ?? 0)}
              label="Total spent"
              accent="bg-rose-500"
              iconBg="bg-rose-50 text-rose-600"
            />
            <StatTile
              icon={<Receipt className="h-4 w-4" />}
              value={totals._count}
              label="Entries"
              accent="bg-slate-400"
              iconBg="bg-slate-50 text-slate-600"
            />
          </div>

          <div className="grid gap-8 lg:grid-cols-[1fr_27rem]">
            <div className="min-w-0 space-y-4">
              <Card className="border-border/60 shadow-sm">
                <CardContent className="p-2.5">
                  {/* Keyed on the current filters so a Link-based "Clear" (a soft
                      client-side navigation) remounts these uncontrolled selects
                      instead of leaving their DOM value stuck at whatever was
                      last picked — a plain GET submit already forces a full
                      reload and doesn't need this, but Clear doesn't. */}
                  <form
                    action="/protected/expenses"
                    key={`${categoryFilter}-${propertyFilter}-${yearFilter}`}
                  >
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="expense-category-filter" className="text-xs">
                          Category
                        </Label>
                        <Select
                          id="expense-category-filter"
                          name="category"
                          defaultValue={categoryFilter}
                          className="h-8 text-xs"
                        >
                          <option value="all">All categories</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.label}
                            </option>
                          ))}
                        </Select>
                      </div>

                      {properties.length > 0 && (
                        <div className="space-y-1.5">
                          <Label htmlFor="expense-property-filter" className="text-xs">
                            Property
                          </Label>
                          <Select
                            id="expense-property-filter"
                            name="property"
                            defaultValue={propertyFilter}
                            className="h-8 text-xs"
                          >
                            <option value="all">All properties</option>
                            {properties.map((property) => (
                              <option key={property.id} value={property.id}>
                                {property.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <Label htmlFor="expense-year-filter" className="text-xs">
                          Year
                        </Label>
                        <Select
                          id="expense-year-filter"
                          name="year"
                          defaultValue={yearFilter}
                          className="h-8 text-xs"
                        >
                          <option value="all">All years</option>
                          {years.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <SubmitButton variant="outline" size="sm" pendingText="Filtering...">
                        Apply
                      </SubmitButton>

                      {(categoryFilter !== "all" ||
                        propertyFilter !== "all" ||
                        yearFilter !== "all") && (
                        <ButtonLink href="/protected/expenses" variant="ghost" size="sm">
                          Clear
                        </ButtonLink>
                      )}
                    </div>
                  </form>
                </CardContent>
              </Card>

              {yearFilter !== "all" && (
                <Card className="border-border/60 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {yearFilter} yearly report
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {categoryBreakdown.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No expenses logged for {yearFilter} yet.
                      </p>
                    ) : (
                      <div className="divide-y divide-border/60">
                        {categoryBreakdown.map((row) => {
                          const rowTotal = moneyValue(row._sum.amount ?? 0);
                          const grandTotal = moneyValue(totals._sum.amount ?? 0);
                          const share = grandTotal > 0 ? (rowTotal / grandTotal) * 100 : 0;
                          return (
                            <div
                              key={row.categoryId}
                              className="flex items-center justify-between gap-3 py-2 text-sm"
                            >
                              <div className="min-w-0">
                                <p className="font-medium">
                                  {categoryLabelById.get(row.categoryId) ?? "—"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {row._count} {row._count === 1 ? "entry" : "entries"} ·{" "}
                                  {share.toFixed(1)}%
                                </p>
                              </div>
                              <p className="shrink-0 font-semibold">
                                {formatMoney(row._sum.amount ?? 0)}
                              </p>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between pt-2 text-sm font-semibold">
                          <p>Total</p>
                          <p>{formatMoney(totals._sum.amount ?? 0)}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {expenses.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No expenses match this filter"
                  description="Log one from the panel on the right, or clear a filter above."
                />
              ) : (
                <Card className="overflow-hidden">
                  <div className="divide-y divide-border/60">
                    {expenses.map((expense) => {
                      const targetLabel =
                        expense.units.length > 0
                          ? `${expense.units[0].unit.property.name} · ${expense.units
                              .map((u) =>
                                formatUnitLabel(u.unit.property.propertyType, u.unit.label),
                              )
                              .join(", ")}`
                          : expense.property
                            ? `${expense.property.name} (property-wide)`
                            : "—";
                      const expensePropertyId =
                        expense.propertyId ?? expense.units[0]?.unit.propertyId ?? null;
                      const isOaExpense =
                        expense.property?.propertyType.isOwnerAssociation ??
                        expense.units[0]?.unit.property.propertyType
                          .isOwnerAssociation ??
                        false;

                      return (
                        <div
                          key={expense.id}
                          className="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20">
                                {expense.category.label}
                              </span>
                              {expense.subcategory && (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-500/20">
                                  {expense.subcategory}
                                </span>
                              )}
                              <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-inset ring-sky-600/20">
                                {expense.supplier?.companyName ?? "Company default"}
                              </span>
                              {expense.paidBy === "owner" && (
                                <span className="inline-flex items-center rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20">
                                  Paid by owner
                                </span>
                              )}
                              {!isOaExpense &&
                                expense.ownerChargeMethod === "service_charge_deduction" && (
                                  <span className="inline-flex items-center rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 ring-1 ring-inset ring-teal-600/20">
                                    Deducted from service charge
                                  </span>
                                )}
                              <p className="text-sm font-semibold">
                                {formatMoney(expense.amount)}
                                {moneyValue(expense.vatAmount) > 0 && (
                                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                                    + VAT {formatMoney(expense.vatAmount)}
                                  </span>
                                )}
                              </p>
                              <span className="text-xs text-muted-foreground">
                                {format(expense.date, "d MMM yyyy")}
                              </span>
                            </div>
                            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {targetLabel}
                              </span>
                              <span className="text-border">·</span>
                              <span className="max-w-md truncate" title={expense.description}>
                                {expense.description}
                              </span>
                              {expense.paymentReference && (
                                <>
                                  <span className="text-border">·</span>
                                  <span>Ref: {expense.paymentReference}</span>
                                </>
                              )}
                              {expense.notes && (
                                <>
                                  <span className="text-border">·</span>
                                  <span
                                    className="max-w-xs truncate italic"
                                    title={expense.notes}
                                  >
                                    {expense.notes}
                                  </span>
                                </>
                              )}
                              {expense.receiptFilePath && (
                                <>
                                  <span className="text-border">·</span>
                                  <a
                                    href={`/api/expense-receipt/${expense.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                  >
                                    <FileText className="h-3 w-3" />
                                    Receipt
                                  </a>
                                </>
                              )}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-3">
                            <ExpenseEditModal
                              expense={{
                                id: expense.id,
                                categoryId: expense.category.id,
                                subcategory: expense.subcategory,
                                supplierId: expense.supplier?.id ?? null,
                                propertyId: expensePropertyId,
                                description: expense.description,
                                amount: moneyValue(expense.amount),
                                vatAmount: moneyValue(expense.vatAmount),
                                fundId: expense.fund.id,
                                paymentReference: expense.paymentReference,
                                paidBy: expense.paidBy,
                                ownerChargeMethod: expense.ownerChargeMethod,
                                notes: expense.notes,
                                date: expense.date,
                                receiptFileName: expense.receiptFileName,
                              }}
                              categories={categories}
                              suppliers={suppliers}
                              targetLabel={targetLabel}
                              isOaExpense={isOaExpense}
                              noServiceCharge={
                                expensePropertyId
                                  ? noServiceChargeById.get(expensePropertyId) ?? false
                                  : false
                              }
                            />
                            <form>
                              <input type="hidden" name="expenseId" value={expense.id} />
                              <SubmitButton
                                formAction={deleteExpenseAction}
                                variant="ghost"
                                size="sm"
                                pendingText="Deleting..."
                                className="text-muted-foreground hover:text-destructive"
                              >
                                Delete
                              </SubmitButton>
                            </form>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>

            <div className="space-y-4 lg:sticky lg:top-24 lg:h-fit lg:max-h-[calc(100vh-7rem)]">
              <Card className="flex flex-col lg:max-h-[calc(100vh-7rem)]">
                <CardHeader>
                  <CardTitle className="text-base">Log an expense</CardTitle>
                </CardHeader>
                <CardContent className="overflow-y-auto">
                  <LogExpenseForm
                    properties={properties.map((property) => ({
                      ...property,
                      propertyType: {
                        name: property.propertyType.name,
                        isOwnerAssociation: property.propertyType.isOwnerAssociation,
                        noServiceCharge: !collectsServiceCharge(property.propertyType),
                      },
                    }))}
                    units={unitOptions}
                    categories={categories}
                    suppliers={suppliers}
                    defaultPropertyId={
                      propertyFilter !== "all" ? propertyFilter : undefined
                    }
                    funds={funds}
                    back="/protected/expenses"
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({
  icon,
  value,
  label,
  accent = "bg-slate-400",
  iconBg = "bg-slate-50 text-slate-600",
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  accent?: string;
  iconBg?: string;
}) {
  return (
    <Card className="relative overflow-hidden border-border/60 shadow-sm">
      <span className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <CardContent className="flex items-start gap-2 p-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            {value}
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {label}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
