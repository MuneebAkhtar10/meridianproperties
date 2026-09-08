import { format } from "date-fns";
import {
  FilePenLine,
  Home,
  KeyRound,
  LogOut,
  Plus,
  Users,
} from "lucide-react";

import {
  endTenancyAction,
  resendTenancyWelcomeEmailAction,
  startTenancyAction,
  updateTenancyAction,
} from "@/app/finance-actions";
import { EmptyState } from "@/components/empty-state";
import { EntityDocumentManager } from "@/components/entity-document-manager";
import { ManageToggle } from "@/components/manage-toggle";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  UploadBudgetProvider,
  UploadFileInput,
} from "@/components/upload-file-input";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UnitPicker, type PickableUnit } from "@/components/unit-picker";
import { chargeBalance, dateInputValue, formatMoney } from "@/lib/finance";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireAnyRole } from "@/lib/session";
import {
  ChargeStatus,
  TenancyPurpose,
  UserType,
} from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export default async function TenanciesPage({ searchParams }: PageProps) {
  const message = (await searchParams) as unknown as Message;
  const user = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = user.userType === UserType.owner;
  const isAdmin = user.userType === UserType.admin;

  const params = (await searchParams) as unknown as {
    property?: string;
  };
  const propertyFilter = params.property || "all";
  const propertyScope =
    propertyFilter !== "all" ? { unit: { propertyId: propertyFilter } } : {};

  const [active, history, availableTenants, emptyUnits, properties] =
    await Promise.all([
      prisma.tenancy.findMany({
        where: {
          endDate: null,
          ...(isOwner ? { unit: { property: { ownerId: user.id } } } : {}),
          ...propertyScope,
        },
        orderBy: { createdAt: "desc" },
        include: {
          tenant: true,
          unit: { include: { property: { include: { propertyType: true } } } },
          documents: { orderBy: { createdAt: "desc" } },
          charges: {
            where: { status: ChargeStatus.open },
            select: {
              amount: true,
              status: true,
              payments: { select: { amount: true, status: true } },
            },
          },
        },
      }),
      prisma.tenancy.findMany({
        where: {
          endDate: { not: null },
          ...(isOwner ? { unit: { property: { ownerId: user.id } } } : {}),
          ...propertyScope,
        },
        orderBy: { endDate: "desc" },
        take: 20,
        include: {
          tenant: { select: { email: true, firstName: true, lastName: true } },
          unit: { include: { property: { include: { propertyType: true } } } },
        },
      }),
      isAdmin
        ? prisma.user.findMany({
            where: { userType: UserType.user, unit: null },
            orderBy: { email: "asc" },
            select: { id: true, email: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      isAdmin
        ? prisma.unit.findMany({
            where: { tenantId: null },
            orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
            include: { property: { include: { propertyType: true } } },
          })
        : Promise.resolve([]),
      prisma.property.findMany({
        where: isOwner ? { ownerId: user.id } : {},
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
  const pickableUnits: PickableUnit[] = emptyUnits.map((unit) => ({
    id: unit.id,
    label: unit.label,
    propertyName: unit.property.name,
    propertyTypeId: unit.property.propertyTypeId,
    propertyTypeLabel: unit.property.propertyType.label,
    propertyTypeUnitNounSingular: unit.property.propertyType.unitNounSingular,
    propertyTypeUnitNounPlural: unit.property.propertyType.unitNounPlural,
    propertyTypeUnitPrefix: unit.property.propertyType.unitPrefix,
  }));
  const scheduledMonthlyRent = active.reduce(
    (total, tenancy) => total + Number(tenancy.monthlyRent),
    0,
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8">
      <PageHeader
        title="Tenancies"
        description={`${active.length} active · ${formatMoney(scheduledMonthlyRent)} scheduled monthly rent`}
      />

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <form className="flex flex-wrap items-end gap-2">
        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor="property">Property</Label>
          <Select id="property" name="property" defaultValue={propertyFilter}>
            <option value="all">All properties</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </Select>
        </div>
        <SubmitButton variant="outline" pendingText="Filtering...">
          Filter
        </SubmitButton>
      </form>

      <div className="flex flex-wrap gap-4">
        <Card className="relative w-full overflow-hidden border-border/60 shadow-sm sm:w-auto sm:min-w-64">
          <span className="absolute inset-x-0 top-0 h-1 bg-emerald-500" />
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Users className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Active tenancies</p>
              <p className="text-2xl font-semibold">{active.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="relative w-full overflow-hidden border-border/60 shadow-sm sm:w-auto sm:min-w-72">
          <span className="absolute inset-x-0 top-0 h-1 bg-[#0886be]" />
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0886be]/10 text-[#0886be]">
              <Home className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="whitespace-nowrap text-xs text-muted-foreground">
                Scheduled monthly rent
              </p>
              <p className="whitespace-nowrap text-2xl font-semibold">
                {formatMoney(scheduledMonthlyRent)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          {active.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No active tenancies"
              description="Start a tenancy to connect a unit, tenant, rent terms and ledger history."
            />
          ) : (
            <div className="space-y-4">
              {active.map((tenancy) => {
                const name = [tenancy.tenant.firstName, tenancy.tenant.lastName]
                  .filter(Boolean)
                  .join(" ");
                const outstanding = tenancy.charges.reduce(
                  (total, charge) => total + chargeBalance(charge),
                  0,
                );

                return (
                  <Card
                    key={tenancy.id}
                    className="border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <CardContent className="space-y-5 p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0886be]/10 text-[#0886be]">
                            <Home className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">
                                {tenancy.unit.property.name} ·{" "}
                                {formatUnitLabel(
                                  tenancy.unit.property.propertyType,
                                  tenancy.unit.label,
                                )}
                              </p>
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                Active
                              </span>
                            </div>
                            <p className="break-words text-sm text-muted-foreground">
                              {name || tenancy.tenant.email} ·{" "}
                              {tenancy.tenant.email}
                              {tenancy.tenant.phone
                                ? ` · ${tenancy.tenant.phone}`
                                : ""}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Since {format(tenancy.startDate, "dd MMM yyyy")}
                              {tenancy.leaseEndDate
                                ? ` · lease ends ${format(tenancy.leaseEndDate, "dd MMM yyyy")}`
                                : " · open-ended"}
                            </p>
                          </div>
                        </div>

                        <div className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-1 text-left text-sm sm:text-right">
                          <span className="text-xs text-muted-foreground">
                            Monthly rent
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Outstanding
                          </span>
                          <span className="font-semibold">
                            {formatMoney(tenancy.monthlyRent)}
                          </span>
                          <span
                            className={
                              outstanding > 0
                                ? "font-semibold text-rose-700"
                                : "font-semibold"
                            }
                          >
                            {formatMoney(outstanding)}
                          </span>
                        </div>
                      </div>

                      {Number(tenancy.monthlyRent) === 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          This assignment was imported without rent terms. Add
                          the actual monthly rent before generating rent.
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                        <span>
                          Rent due{" "}
                          <span className="font-medium text-foreground">
                            Day {tenancy.rentDueDay}
                          </span>
                        </span>
                        <span>
                          Deposit{" "}
                          <span className="font-medium text-foreground">
                            {formatMoney(tenancy.securityDeposit)}
                          </span>
                        </span>
                        <span>
                          Purpose{" "}
                          <span className="font-medium text-foreground">
                            {tenancy.purpose === TenancyPurpose.residential
                              ? "Residential"
                              : "Commercial"}
                          </span>
                        </span>
                        {tenancy.tenant.civilId && (
                          <span>
                            Civil ID{" "}
                            <span className="font-medium text-foreground">
                              {tenancy.tenant.civilId}
                            </span>
                          </span>
                        )}
                      </div>

                      {!isAdmin && (
                        <div className="border-t pt-4">
                          <EntityDocumentManager
                            documents={tenancy.documents}
                            targetType="tenancy"
                            targetId={tenancy.id}
                            back="/protected/tenancies"
                            title="Tenancy documents"
                            readOnly
                            description="Signed agreement, municipality registration, handover report and other supporting documents."
                          />
                        </div>
                      )}

                      {isAdmin && (
                      <ManageToggle
                        label="Manage tenancy"
                        hint="Terms, Oman records and move-out"
                        icon={<FilePenLine className="h-3.5 w-3.5" />}
                      >
                        <div className="space-y-5">
                          <form className="space-y-5">
                            <input
                              type="hidden"
                              name="tenancyId"
                              value={tenancy.id}
                            />
                            <FormSection
                              title="Lease details"
                              description="Move-in period and unit usage."
                            >
                              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <Field label="Move-in date">
                                  <Input
                                    name="startDate"
                                    type="date"
                                    defaultValue={dateInputValue(
                                      tenancy.startDate,
                                    )}
                                    required
                                  />
                                </Field>
                                <Field label="Lease end">
                                  <Input
                                    name="leaseEndDate"
                                    type="date"
                                    defaultValue={
                                      tenancy.leaseEndDate
                                        ? dateInputValue(tenancy.leaseEndDate)
                                        : ""
                                    }
                                  />
                                </Field>
                                <Field label="Lease purpose">
                                  <Select
                                    name="purpose"
                                    defaultValue={tenancy.purpose}
                                  >
                                    <option value={TenancyPurpose.residential}>
                                      Residential
                                    </option>
                                    <option value={TenancyPurpose.commercial}>
                                      Commercial
                                    </option>
                                  </Select>
                                </Field>
                              </div>
                            </FormSection>

                            <FormSection
                              title="Rent terms"
                              description="Amounts are stored in OMR with three decimal places."
                            >
                              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <Field label="Monthly rent (OMR)">
                                  <Input
                                    name="monthlyRent"
                                    type="number"
                                    min={0}
                                    step="0.001"
                                    defaultValue={tenancy.monthlyRent.toString()}
                                    required
                                  />
                                </Field>
                                <Field label="Security deposit (OMR)">
                                  <Input
                                    name="securityDeposit"
                                    type="number"
                                    min={0}
                                    step="0.001"
                                    defaultValue={tenancy.securityDeposit.toString()}
                                    required
                                  />
                                </Field>
                                <Field label="Rent due day (1–28)">
                                  <Input
                                    name="rentDueDay"
                                    type="number"
                                    min={1}
                                    max={28}
                                    defaultValue={tenancy.rentDueDay}
                                    required
                                  />
                                </Field>
                              </div>
                            </FormSection>

                            <FormSection
                              title="Oman tenancy registration"
                              description="Registration date; supporting documents are managed below."
                            >
                              <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Contract registered on">
                                  <Input
                                    name="contractRegisteredAt"
                                    type="date"
                                    defaultValue={
                                      tenancy.contractRegisteredAt
                                        ? dateInputValue(
                                            tenancy.contractRegisteredAt,
                                          )
                                        : ""
                                    }
                                  />
                                </Field>
                              </div>
                            </FormSection>

                            <Field label="Notes">
                              <Textarea
                                name="notes"
                                defaultValue={tenancy.notes ?? ""}
                                className="min-h-24"
                              />
                            </Field>
                            <div className="flex justify-end">
                              <SubmitButton
                                formAction={updateTenancyAction}
                                pendingText="Saving..."
                              >
                                Save tenancy details
                              </SubmitButton>
                            </div>
                          </form>

                          <form className="flex items-center justify-between gap-4 border-t p-4 sm:p-5">
                            <input
                              type="hidden"
                              name="tenancyId"
                              value={tenancy.id}
                            />
                            <div>
                              <p className="text-sm font-medium">
                                Welcome email
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Resends the move-in email with the tenancy's
                                current terms.
                              </p>
                            </div>
                            <SubmitButton
                              formAction={resendTenancyWelcomeEmailAction}
                              variant="outline"
                              size="sm"
                              pendingText="Sending..."
                            >
                              Resend
                            </SubmitButton>
                          </form>

                          <div className="border-t p-4 sm:p-5">
                            <EntityDocumentManager
                              documents={tenancy.documents}
                              targetType="tenancy"
                              targetId={tenancy.id}
                              back="/protected/tenancies"
                              title="Tenancy documents"
                              description="Signed agreement, municipality registration, handover report and other supporting documents."
                            />
                          </div>

                          <form className="flex flex-col gap-4 border-t border-rose-200 bg-rose-50/60 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
                            <input
                              type="hidden"
                              name="tenancyId"
                              value={tenancy.id}
                            />
                            <div className="max-w-md">
                              <p className="font-medium text-rose-950">
                                Move out tenant
                              </p>
                              <p className="mt-1 text-xs leading-5 text-rose-800/80">
                                This closes the tenancy and frees the unit.
                                Charges and payment history stay preserved.
                              </p>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                              <div className="sm:w-48">
                                <Field label="Move-out date">
                                  <Input
                                    name="endDate"
                                    type="date"
                                    defaultValue={dateInputValue()}
                                    min={dateInputValue(tenancy.startDate)}
                                    required
                                  />
                                </Field>
                              </div>
                              <SubmitButton
                                formAction={endTenancyAction}
                                variant="destructive"
                                pendingText="Ending..."
                              >
                                <LogOut className="h-4 w-4" />
                                End tenancy
                              </SubmitButton>
                            </div>
                          </form>
                        </div>
                      </ManageToggle>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {history.length > 0 && (
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <LogOut className="h-3.5 w-3.5" />
                  </span>
                  Move-out history
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr className="border-b border-border/60">
                        <th className="pb-2 font-medium">Tenant</th>
                        <th className="pb-2 font-medium">Unit</th>
                        <th className="pb-2 font-medium">Period</th>
                        <th className="pb-2 text-right font-medium">Rent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((tenancy) => (
                        <tr
                          key={tenancy.id}
                          className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                        >
                          <td className="py-3 pr-4">{tenancy.tenant.email}</td>
                          <td className="py-3 pr-4">
                            {tenancy.unit.property.name} ·{" "}
                            {formatUnitLabel(
                              tenancy.unit.property.propertyType,
                              tenancy.unit.label,
                            )}
                          </td>
                          <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                              Ended
                            </span>
                            <span className="ml-2">
                              {format(tenancy.startDate, "dd MMM yyyy")} –{" "}
                              {tenancy.endDate
                                ? format(tenancy.endDate, "dd MMM yyyy")
                                : "—"}
                            </span>
                          </td>
                          <td className="py-3 text-right font-medium">
                            {formatMoney(tenancy.monthlyRent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {isAdmin && (
        <Card
          className={`h-fit overflow-hidden border-border/60 shadow-sm ${
            availableTenants.length === 0 || emptyUnits.length === 0
              ? "xl:sticky xl:top-24"
              : ""
          }`}
        >
          <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3.5 text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
              <Plus className="h-4 w-4" />
            </span>
            <span className="text-base font-semibold">Start a tenancy</span>
          </div>
          <CardContent className="pt-5">
            {availableTenants.length === 0 || emptyUnits.length === 0 ? (
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>
                  You need both an unassigned tenant and an empty unit to
                  start a tenancy.
                </p>
                <p className="text-xs">
                  Create tenant accounts under People and units under
                  Properties.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <ButtonLink
                    href="/protected/users"
                    variant="outline"
                    size="sm"
                  >
                    <Users className="h-4 w-4" />
                    People
                  </ButtonLink>
                  <ButtonLink
                    href="/protected/properties"
                    variant="outline"
                    size="sm"
                  >
                    <Home className="h-4 w-4" />
                    Properties
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <UploadBudgetProvider>
                <form className="space-y-4" encType="multipart/form-data">
                  <div className="rounded-lg border border-[#0886be]/25 bg-[#0886be]/10 p-3 text-xs text-[#075e82]">
                    Oman record checklist: keep the tenant Civil ID under
                    People, title deed/plot under Property, and add the
                    municipality contract below.
                  </div>
                  <Field label="Tenant">
                    <Select name="tenantId" required defaultValue="">
                      <option value="" disabled>
                        Select tenant
                      </option>
                      {availableTenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {[tenant.firstName, tenant.lastName]
                            .filter(Boolean)
                            .join(" ") || tenant.email}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <UnitPicker
                    id="new-tenancy-unit"
                    name="unitId"
                    units={pickableUnits}
                    required
                  />


                  <StartFormHeading>Lease details</StartFormHeading>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Move-in">
                      <Input
                        name="startDate"
                        type="date"
                        defaultValue={dateInputValue()}
                        required
                      />
                    </Field>
                    <Field label="Lease end">
                      <Input name="leaseEndDate" type="date" />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Monthly rent">
                      <Input
                        name="monthlyRent"
                        type="number"
                        min={0}
                        step="0.001"
                        required
                      />
                    </Field>
                    <Field label="Due day">
                      <Input
                        name="rentDueDay"
                        type="number"
                        min={1}
                        max={28}
                        defaultValue={5}
                        required
                      />
                    </Field>
                  </div>

                  <Field label="Security deposit (OMR)">
                    <Input
                      name="securityDeposit"
                      type="number"
                      min={0}
                      step="0.001"
                      defaultValue={0}
                      required
                    />
                  </Field>

                  <Field label="Lease purpose">
                    <Select
                      name="purpose"
                      defaultValue={TenancyPurpose.residential}
                    >
                      <option value={TenancyPurpose.residential}>
                        Residential
                      </option>
                      <option value={TenancyPurpose.commercial}>
                        Commercial
                      </option>
                    </Select>
                  </Field>

                  <StartFormHeading>Oman registration</StartFormHeading>

                  <Field label="Signed tenancy agreement">
                    <UploadFileInput
                      name="tenancyAgreementDocuments"
                      multiple
                    />
                  </Field>
                  <Field label="Municipality registration documents">
                    <UploadFileInput name="municipalityDocuments" multiple />
                  </Field>
                  <Field label="Contract registered on">
                    <Input name="contractRegisteredAt" type="date" />
                  </Field>
                  <Field label="Other tenancy documents">
                    <UploadFileInput name="otherTenancyDocuments" multiple />
                  </Field>

                  <Field label="Notes">
                    <Textarea
                      name="notes"
                      className="min-h-20"
                      placeholder="Occupants and special terms…"
                    />
                  </Field>

                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="createFirstRent"
                      defaultChecked
                      className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                    />
                    <span>
                      Create first rent charge
                      <span className="block text-xs text-muted-foreground">
                        Uses the move-in month.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="createDepositCharge"
                      defaultChecked
                      className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                    />
                    <span>
                      Create deposit charge
                      <span className="block text-xs text-muted-foreground">
                        Skipped when deposit is zero.
                      </span>
                    </span>
                  </label>

                  <SubmitButton
                    formAction={startTenancyAction}
                    className="w-full"
                    pendingText="Starting..."
                  >
                    <KeyRound className="h-4 w-4" />
                    Start tenancy
                  </SubmitButton>
                </form>
              </UploadBudgetProvider>
            )}
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border bg-background p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function StartFormHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className="mt-1 [overflow-wrap:anywhere] font-medium leading-snug"
        title={value}
      >
        {value}
      </p>
    </div>
  );
}
