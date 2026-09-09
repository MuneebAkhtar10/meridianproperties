import {
  DoorOpen,
  KeyRound,
  LayoutGrid,
  MapPin,
  Trash2,
  UserPlus,
  Wand2,
} from "lucide-react";
import { notFound } from "next/navigation";

import {
  assignTenantAction,
  createUnitAction,
  deleteUnitAction,
  generateUnitsAction,
  markServiceChargeReceivedAction,
  resendServiceChargeReminderAction,
  submitPropertyForApprovalAction,
  updatePropertyAction,
  updateServiceChargeAction,
  updateUnitAction,
} from "@/app/admin-actions";
import { CalendarClock, Check, Pencil } from "lucide-react";
import { differenceInCalendarDays, format } from "date-fns";
import { EmptyState } from "@/components/empty-state";
import { EntityDocumentManager } from "@/components/entity-document-manager";
import { FormMessage, Message } from "@/components/form-message";
import { ManageToggle } from "@/components/manage-toggle";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ButtonLink } from "@/components/ui/button-link";
import { formatMoney } from "@/lib/finance";
import { formatOmanAddress, OMAN_GOVERNORATES } from "@/lib/oman";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireAnyRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export default async function PropertyDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const message = (await searchParams) as unknown as Message;

  const user = await requireAnyRole(UserType.admin, UserType.owner);
  const isAdmin = user.userType === UserType.admin;
  const isOwner = user.userType === UserType.owner;

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      propertyType: true,
      owner: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
      documents: { orderBy: { createdAt: "desc" } },
      units: {
        orderBy: [{ floor: "asc" }, { label: "asc" }],
        include: {
          tenant: { select: { id: true, email: true } },
          _count: { select: { requests: true } },
          tenancies: {
            where: { endDate: null },
            select: { monthlyRent: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!property || (isOwner && property.ownerId !== user.id)) {
    notFound();
  }

  // Tenants who could move in: anyone with the tenant role who isn't already housed.
  const [availableTenants, propertyTypes, owners] = await Promise.all([
    prisma.user.findMany({
      where: { userType: UserType.user, unit: null },
      orderBy: { email: "asc" },
      select: { id: true, email: true },
    }),
    prisma.propertyType.findMany({ orderBy: { createdAt: "asc" } }),
    isAdmin
      ? prisma.user.findMany({
          where: { userType: UserType.owner },
          select: { id: true, email: true },
          orderBy: { email: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const ownerName = property.owner
    ? [property.owner.firstName, property.owner.lastName]
        .filter(Boolean)
        .join(" ")
    : null;
  const ownerLabel = property.owner
    ? ownerName
      ? `${ownerName} (${property.owner.email})`
      : property.owner.email
    : "No owner assigned";

  const propertyType = property.propertyType;
  const hasFloors = propertyType.hasFloors;
  const hasBedrooms = propertyType.hasBedrooms;
  const unitNoun = propertyType.unitNounSingular.toLowerCase();
  const unitNounCap = propertyType.unitNounSingular;
  const occupied = property.units.filter((u) => u.tenant).length;
  const scheduledMonthlyRent = property.units.reduce(
    (total, unit) => total + Number(unit.tenancies[0]?.monthlyRent ?? 0),
    0,
  );
  const byFloor = new Map<number | null, typeof property.units>();

  for (const unit of property.units) {
    const list = byFloor.get(unit.floor) ?? [];
    list.push(unit);
    byFloor.set(unit.floor, list);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <PageHeader
        title={property.name}
        description={`${propertyType.label} · ${formatOmanAddress(property)} · Owner: ${ownerLabel}`}
        back={{ href: "/protected/properties", label: "All properties" }}
      >
        <ButtonLink href="/protected/tenancies" variant="outline">
          <KeyRound className="h-4 w-4" />
          Tenancy terms
        </ButtonLink>
      </PageHeader>

      {!property.approved && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            {property.submittedAt ? "Pending approval" : "Draft"}
          </span>
          <span>
            {isAdmin
              ? property.submittedAt
                ? "This property was submitted by its owner and isn't live yet. Approve or reject it from the properties list."
                : "This property is still a draft — the owner hasn't submitted it for review yet."
              : property.submittedAt
                ? "Your property has been submitted and is waiting for an admin to approve it."
                : `Add your ${propertyType.unitNounPlural.toLowerCase()} below, then submit this property for admin review.`}
          </span>
        </div>
      )}

      {isOwner && !property.approved && !property.submittedAt && (
        <form action={submitPropertyForApprovalAction}>
          <input type="hidden" name="propertyId" value={property.id} />
          <SubmitButton
            disabled={property.units.length === 0}
            title={
              property.units.length === 0
                ? `Add at least one ${unitNoun} before submitting.`
                : undefined
            }
          >
            Submit for Approval
          </SubmitButton>
        </form>
      )}

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          icon={<DoorOpen className="h-4 w-4" />}
          value={property.units.length}
          label={propertyType.unitNounPlural}
        />
        <SummaryTile
          icon={<UserPlus className="h-4 w-4" />}
          value={occupied}
          label="Occupied"
        />
        <SummaryTile
          icon={<LayoutGrid className="h-4 w-4" />}
          value={property.units.length - occupied}
          label="Empty"
        />
        <SummaryTile
          icon={<KeyRound className="h-4 w-4" />}
          value={formatMoney(scheduledMonthlyRent)}
          label="Scheduled monthly rent"
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        {/* ── Apartments ─────────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-6">
          {property.units.length === 0 ? (
            <EmptyState
              icon={DoorOpen}
              title={`No ${propertyType.unitNounPlural.toLowerCase()} yet`}
              description={
                hasFloors
                  ? `Use "Generate ${propertyType.unitNounPlural.toLowerCase()}" to create them all at once — 10 floors × 5 per floor gives you 50.`
                  : `Use "Add ${unitNoun}" to add them one at a time.`
              }
            />
          ) : (
            /* A table, not cards: fifty apartments have to stay scannable. */
            [...byFloor.entries()].map(([floor, units]) => (
              <Card key={String(floor)} className="overflow-hidden">
                <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
                  <h2 className="text-sm font-medium">
                    {!hasFloors
                      ? propertyType.unitNounPlural
                      : floor === null
                        ? "Unassigned floor"
                        : `Floor ${floor}`}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {units.filter((u) => u.tenant).length}/{units.length}{" "}
                    occupied
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="py-2 pl-4 pr-3 font-semibold">
                          {unitNounCap} details
                        </th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Tenant</th>
                        <th className="py-2 pl-3 pr-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((unit) => (
                        <tr
                          key={unit.id}
                          className="border-b last:border-b-0 hover:bg-muted/30"
                        >
                          <td className="py-2.5 pl-4 pr-3">
                            {(isAdmin || isOwner) ? (
                              <form className="flex flex-nowrap items-end gap-2 rounded-md border bg-muted/10 px-2 py-1.5">
                                <input
                                  type="hidden"
                                  name="unitId"
                                  value={unit.id}
                                />
                                <Field
                                  label={
                                    propertyType.unitPrefix
                                      ? `${propertyType.unitPrefix} #`
                                      : "Number"
                                  }
                                >
                                  <Input
                                    name="label"
                                    defaultValue={unit.label}
                                    className="h-8 w-20 text-xs font-medium"
                                    aria-label={`${unitNounCap} number, currently ${unit.label}`}
                                  />
                                </Field>
                                {hasFloors && (
                                  <Field label="Floor">
                                    <Input
                                      name="floor"
                                      type="number"
                                      defaultValue={unit.floor ?? ""}
                                      className="h-8 w-20 text-xs"
                                      aria-label={`Floor for ${unitNoun} ${unit.label}`}
                                    />
                                  </Field>
                                )}
                                {hasBedrooms && (
                                  <Field label="Bedrooms">
                                    <Input
                                      name="bedrooms"
                                      type="number"
                                      min={0}
                                      defaultValue={unit.bedrooms ?? ""}
                                      className="h-8 w-20 text-xs"
                                      aria-label={`Bedrooms for ${unitNoun} ${unit.label}`}
                                    />
                                  </Field>
                                )}
                                <SubmitButton
                                  formAction={updateUnitAction}
                                  variant="outline"
                                  size="sm"
                                  pendingText="…"
                                  className="h-8 shrink-0"
                                >
                                  Save
                                </SubmitButton>
                              </form>
                            ) : (
                              <p className="text-sm font-medium">
                                {propertyType.unitPrefix
                                  ? `${propertyType.unitPrefix} ${unit.label}`
                                  : unit.label}
                                {hasFloors && unit.floor !== null
                                  ? ` · Floor ${unit.floor}`
                                  : ""}
                                {hasBedrooms && unit.bedrooms
                                  ? ` · ${unit.bedrooms} bed`
                                  : ""}
                              </p>
                            )}
                            {unit._count.requests > 0 && (
                              <p className="mt-1.5 text-[11px] text-muted-foreground">
                                {unit._count.requests} request
                                {unit._count.requests === 1 ? "" : "s"}
                              </p>
                            )}
                          </td>

                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                                unit.tenant
                                  ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                                  : "bg-slate-50 text-slate-600 ring-slate-500/20"
                              }`}
                            >
                              {unit.tenant ? "Occupied" : "Empty"}
                            </span>
                          </td>

                          <td className="px-3 py-2.5">
                            {isAdmin ? (
                              <form className="flex items-center gap-2">
                                <input
                                  type="hidden"
                                  name="unitId"
                                  value={unit.id}
                                />
                                <Select
                                  name="tenantId"
                                  defaultValue={unit.tenant?.id ?? ""}
                                  className="h-8 min-w-44 text-xs"
                                  aria-label={`Tenant for ${unitNoun} ${unit.label}`}
                                >
                                  <option value="">— Empty —</option>
                                  {/* The current tenant has to stay selectable. */}
                                  {unit.tenant && (
                                    <option value={unit.tenant.id}>
                                      {unit.tenant.email}
                                    </option>
                                  )}
                                  {availableTenants.map((tenant) => (
                                    <option key={tenant.id} value={tenant.id}>
                                      {tenant.email}
                                    </option>
                                  ))}
                                </Select>

                                <SubmitButton
                                  formAction={assignTenantAction}
                                  variant="outline"
                                  size="sm"
                                  pendingText="…"
                                  className="h-8"
                                >
                                  Save
                                </SubmitButton>
                              </form>
                            ) : (
                              <span className="text-sm">
                                {unit.tenant?.email ?? "—"}
                              </span>
                            )}
                          </td>

                          <td className="py-2 pl-3 pr-4 text-right">
                            {(isAdmin || isOwner) && (
                            <form>
                              <input
                                type="hidden"
                                name="unitId"
                                value={unit.id}
                              />
                              <SubmitButton
                                formAction={deleteUnitAction}
                                variant="ghost"
                                size="iconSm"
                                pendingText="…"
                                className="text-muted-foreground hover:text-destructive"
                                aria-label={`Delete ${unitNoun} ${unit.label}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </SubmitButton>
                            </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* ── Tools ──────────────────────────────────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          {(isAdmin || isOwner) && hasFloors && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wand2 className="h-4 w-4" />
                  Generate {propertyType.unitNounPlural.toLowerCase()}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4">
                  <input type="hidden" name="propertyId" value={property.id} />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="floors">Floors</Label>
                      <Input
                        id="floors"
                        name="floors"
                        type="number"
                        min={1}
                        defaultValue={10}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="perFloor">Per floor</Label>
                      <Input
                        id="perFloor"
                        name="perFloor"
                        type="number"
                        min={1}
                        defaultValue={5}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="startFloor">Start floor</Label>
                      <Input
                        id="startFloor"
                        name="startFloor"
                        type="number"
                        min={0}
                        defaultValue={1}
                      />
                    </div>
                    {hasBedrooms && (
                      <div className="space-y-1.5">
                        <Label htmlFor="bedrooms">Bedrooms</Label>
                        <Input
                          id="bedrooms"
                          name="bedrooms"
                          type="number"
                          min={0}
                          placeholder="—"
                        />
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    10 floors × 5 per floor creates{" "}
                    {propertyType.unitNounPlural.toLowerCase()} 101–105,
                    201–205 … 1001–1005. Existing ones are skipped.
                  </p>

                  <SubmitButton
                    formAction={generateUnitsAction}
                    className="w-full"
                    pendingText="Generating..."
                  >
                    Generate
                  </SubmitButton>
                </form>
              </CardContent>
            </Card>
          )}

          {(isAdmin || isOwner) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add {unitNoun}</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3">
                <input type="hidden" name="propertyId" value={property.id} />

                <div
                  className={`grid gap-2 ${
                    [true, hasFloors, hasBedrooms].filter(Boolean).length === 3
                      ? "grid-cols-3"
                      : [true, hasFloors, hasBedrooms].filter(Boolean).length === 2
                        ? "grid-cols-2"
                        : "grid-cols-1"
                  }`}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="label" className="text-xs">
                      Number
                    </Label>
                    <Input
                      id="label"
                      name="label"
                      placeholder={hasFloors ? "101" : `${unitNounCap} 1`}
                      required
                    />
                  </div>
                  {hasFloors && (
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-floor" className="text-xs">
                        Floor
                      </Label>
                      <Input
                        id="unit-floor"
                        name="floor"
                        type="number"
                        placeholder="1"
                      />
                    </div>
                  )}
                  {hasBedrooms && (
                    <div className="space-y-1.5">
                      <Label htmlFor="unit-beds" className="text-xs">
                        Beds
                      </Label>
                      <Input
                        id="unit-beds"
                        name="bedrooms"
                        type="number"
                        placeholder={hasFloors ? "2" : "4"}
                      />
                    </div>
                  )}
                </div>

                <SubmitButton
                  formAction={createUnitAction}
                  variant="outline"
                  className="w-full"
                  pendingText="Adding..."
                >
                  Add {unitNoun}
                </SubmitButton>
              </form>
            </CardContent>
          </Card>
          )}

          {(property.serviceChargeAmount ||
            isAdmin ||
            isOwner) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4" />
                  Service charge
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {property.serviceChargeAmount &&
                property.serviceChargeDueDate ? (
                  (() => {
                    const daysUntilDue = differenceInCalendarDays(
                      property.serviceChargeDueDate,
                      new Date(),
                    );
                    const isOverdue = daysUntilDue < 0;
                    const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 7;
                    return (
                      <>
                        <p className="text-2xl font-semibold tracking-tight">
                          {formatMoney(property.serviceChargeAmount)}
                        </p>
                        <p className="text-muted-foreground">
                          Every {property.serviceChargeCycleMonths}{" "}
                          {property.serviceChargeCycleMonths === 1
                            ? "month"
                            : "months"}{" "}
                          · Due {format(property.serviceChargeDueDate, "d MMM yyyy")}
                        </p>
                        {isOverdue ? (
                          <p className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                            {Math.abs(daysUntilDue)} day
                            {Math.abs(daysUntilDue) === 1 ? "" : "s"} overdue
                          </p>
                        ) : isDueSoon ? (
                          <p className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Due in {daysUntilDue} day{daysUntilDue === 1 ? "" : "s"}
                          </p>
                        ) : null}
                        {property.serviceChargeLastReceivedAt && (
                          <p className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            <Check className="h-3 w-3" />
                            Last payment received{" "}
                            {format(
                              property.serviceChargeLastReceivedAt,
                              "d MMM yyyy",
                            )}
                          </p>
                        )}
                        {/* Owners can see the charge but not act on it —
                            marking it received or resending the reminder
                            are both admin-only operations. */}
                        {isAdmin && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <form>
                              <input type="hidden" name="propertyId" value={property.id} />
                              <SubmitButton
                                formAction={markServiceChargeReceivedAction}
                                variant="outline"
                                size="sm"
                                className="w-full"
                                pendingText="Recording..."
                              >
                                Mark received
                              </SubmitButton>
                            </form>
                            <form>
                              <input type="hidden" name="propertyId" value={property.id} />
                              <SubmitButton
                                formAction={resendServiceChargeReminderAction}
                                variant="outline"
                                size="sm"
                                className="w-full"
                                pendingText="Sending..."
                              >
                                Resend email
                              </SubmitButton>
                            </form>
                          </div>
                        )}

                        {isAdmin && (
                          <ManageToggle
                            label="Edit service charge"
                            icon={<Pencil className="h-3.5 w-3.5" />}
                          >
                            <form className="space-y-3">
                              <input
                                type="hidden"
                                name="propertyId"
                                value={property.id}
                              />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label
                                    htmlFor="sc-amount"
                                    className="text-xs"
                                  >
                                    Amount (OMR)
                                  </Label>
                                  <Input
                                    id="sc-amount"
                                    name="serviceChargeAmount"
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    defaultValue={property.serviceChargeAmount?.toString()}
                                    required
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="sc-cycle" className="text-xs">
                                    Repeats every
                                  </Label>
                                  <Select
                                    id="sc-cycle"
                                    name="serviceChargeCycleMonths"
                                    defaultValue={property.serviceChargeCycleMonths?.toString()}
                                    required
                                  >
                                    <option value="1">1 month</option>
                                    <option value="3">3 months</option>
                                    <option value="6">6 months</option>
                                    <option value="12">12 months</option>
                                  </Select>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="sc-due" className="text-xs">
                                  Due date
                                </Label>
                                <Input
                                  id="sc-due"
                                  name="serviceChargeDueDate"
                                  type="date"
                                  defaultValue={property.serviceChargeDueDate
                                    ?.toISOString()
                                    .slice(0, 10)}
                                  required
                                />
                              </div>
                              <SubmitButton
                                formAction={updateServiceChargeAction}
                                size="sm"
                                className="w-full"
                                pendingText="Saving..."
                              >
                                Save service charge
                              </SubmitButton>
                            </form>
                          </ManageToggle>
                        )}
                      </>
                    );
                  })()
                ) : isAdmin ? (
                  <ManageToggle
                    label="Add service charge"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    defaultOpen
                  >
                    <form className="space-y-3">
                      <input type="hidden" name="propertyId" value={property.id} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="sc-amount" className="text-xs">
                            Amount (OMR)
                          </Label>
                          <Input
                            id="sc-amount"
                            name="serviceChargeAmount"
                            type="number"
                            step="0.001"
                            min="0"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="sc-cycle" className="text-xs">
                            Repeats every
                          </Label>
                          <Select
                            id="sc-cycle"
                            name="serviceChargeCycleMonths"
                            defaultValue="12"
                            required
                          >
                            <option value="1">1 month</option>
                            <option value="3">3 months</option>
                            <option value="6">6 months</option>
                            <option value="12">12 months</option>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="sc-due" className="text-xs">
                          Due date
                        </Label>
                        <Input id="sc-due" name="serviceChargeDueDate" type="date" required />
                      </div>
                      <SubmitButton
                        formAction={updateServiceChargeAction}
                        size="sm"
                        className="w-full"
                        pendingText="Saving..."
                      >
                        Save service charge
                      </SubmitButton>
                    </form>
                  </ManageToggle>
                ) : (
                  <p className="text-muted-foreground">
                    No service charge set up yet.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Property details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formatOmanAddress(property)}</span>
              </p>
              {property.notes && (
                <p className="text-muted-foreground">{property.notes}</p>
              )}
              {isAdmin && (
              <details className="group rounded-lg border">
                <summary className="cursor-pointer list-none px-3 py-2 text-center text-xs font-medium">
                  Edit Oman address & records
                </summary>
                <form className="space-y-3 border-t p-3">
                  <input type="hidden" name="propertyId" value={property.id} />
                  <div className="space-y-1">
                    <Label htmlFor="property-name" className="text-xs">
                      Name
                    </Label>
                    <Input
                      id="property-name"
                      name="name"
                      defaultValue={property.name}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="property-type" className="text-xs">
                      Property type
                    </Label>
                    <Select
                      id="property-type"
                      name="propertyTypeId"
                      defaultValue={property.propertyTypeId}
                      className="text-xs"
                    >
                      {propertyTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="property-address" className="text-xs">
                      Address / locality
                    </Label>
                    <Input
                      id="property-address"
                      name="address"
                      defaultValue={property.address}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="property-governorate" className="text-xs">
                        Governorate
                      </Label>
                      <Select
                        id="property-governorate"
                        name="governorate"
                        defaultValue={property.governorate ?? "Muscat"}
                        className="text-xs"
                      >
                        {OMAN_GOVERNORATES.map((governorate) => (
                          <option key={governorate} value={governorate}>
                            {governorate}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="property-wilayat" className="text-xs">
                        Wilayat
                      </Label>
                      <Input
                        id="property-wilayat"
                        name="wilayat"
                        defaultValue={property.wilayat ?? ""}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="property-area" className="text-xs">
                      Area / village
                    </Label>
                    <Input
                      id="property-area"
                      name="area"
                      defaultValue={property.area ?? ""}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="property-way" className="text-xs">
                        Way
                      </Label>
                      <Input
                        id="property-way"
                        name="wayNumber"
                        defaultValue={property.wayNumber ?? ""}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="property-building" className="text-xs">
                        Building
                      </Label>
                      <Input
                        id="property-building"
                        name="buildingNumber"
                        defaultValue={property.buildingNumber ?? ""}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="property-postal" className="text-xs">
                        PC
                      </Label>
                      <Input
                        id="property-postal"
                        name="postalCode"
                        defaultValue={property.postalCode ?? ""}
                      />
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="space-y-1">
                      <Label htmlFor="property-owner" className="text-xs">
                        Owner
                      </Label>
                      <Select
                        id="property-owner"
                        name="ownerId"
                        defaultValue={property.ownerId ?? ""}
                      >
                        <option value="">No owner assigned</option>
                        {owners.map((owner) => (
                          <option key={owner.id} value={owner.id}>
                            {owner.email}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1 rounded-lg border p-2">
                    <p className="text-xs font-medium">Service charge</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="property-service-amount" className="text-xs">
                          Amount (OMR)
                        </Label>
                        <Input
                          id="property-service-amount"
                          name="serviceChargeAmount"
                          type="number"
                          step="0.001"
                          min="0"
                          defaultValue={property.serviceChargeAmount?.toString() ?? ""}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="property-service-cycle" className="text-xs">
                          Repeats every
                        </Label>
                        <Select
                          id="property-service-cycle"
                          name="serviceChargeCycleMonths"
                          defaultValue={property.serviceChargeCycleMonths?.toString() ?? ""}
                          className="text-xs"
                          required
                        >
                          <option value="" disabled>
                            Select cycle
                          </option>
                          <option value="1">1 month</option>
                          <option value="3">3 months</option>
                          <option value="6">6 months</option>
                          <option value="12">12 months</option>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="property-service-due" className="text-xs">
                        Due date
                      </Label>
                      <Input
                        id="property-service-due"
                        name="serviceChargeDueDate"
                        type="date"
                        defaultValue={
                          property.serviceChargeDueDate
                            ? property.serviceChargeDueDate.toISOString().slice(0, 10)
                            : ""
                        }
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="property-notes" className="text-xs">
                      Notes
                    </Label>
                    <Textarea
                      id="property-notes"
                      name="notes"
                      defaultValue={property.notes ?? ""}
                      className="min-h-16 text-xs"
                    />
                  </div>
                  <SubmitButton
                    formAction={updatePropertyAction}
                    size="sm"
                    className="w-full"
                    pendingText="Saving..."
                  >
                    Save property record
                  </SubmitButton>
                </form>
              </details>
              )}
              <ButtonLink
                href={`/protected/maintenance?property=${property.id}`}
                variant="outline"
                size="sm"
                className="mt-2 w-full"
              >
                View this property&apos;s requests
              </ButtonLink>
            </CardContent>
          </Card>

          <EntityDocumentManager
            documents={property.documents}
            targetType="property"
            targetId={property.id}
            back={`/protected/properties/${property.id}`}
            title="Property documents"
            readOnly={!isAdmin}
            description="Title deed, ownership certificate, building approvals, insurance and other private property records."
          />
        </div>
      </div>
    </div>
  );
}

/** Small labeled slot for a compact inline edit field, e.g. inside a table row. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function SummaryTile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          {icon}
        </span>
        <div>
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
