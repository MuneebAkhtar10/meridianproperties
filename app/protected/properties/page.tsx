import {
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  DoorOpen,
  Home,
  Landmark,
  MapPin,
  Phone,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { FormMessage, Message } from "@/components/form-message";
import { OwnerReportModal } from "@/components/owner-report-modal";
import { PageHeader } from "@/components/page-header";
import { CreatePropertyForm } from "@/components/create-property-form";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatOmanAddress } from "@/lib/oman";
import { prisma } from "@/lib/prisma";
import { requireAnyRole, isStaffAdmin } from "@/lib/session";
import { adminAccess } from "@/lib/permissions";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";
import {
  approvePropertyAction,
  rejectPropertyAction,
} from "@/app/admin-actions";

export default async function PropertiesPage({ searchParams }: PageProps) {
  const params = (await searchParams) as unknown as {
    owner?: string;
    q?: string;
    type?: string;
    newOwner?: string;
    page?: string;
  };
  const message = params as unknown as Message;
  const user = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = user.userType === UserType.owner;
  const isAdmin = isStaffAdmin(user.userType);
  const ownerFilter =
    isAdmin && typeof params.owner === "string" ? params.owner : "all";
  const search =
    isAdmin && typeof params.q === "string" ? params.q.trim() : "";
  const typeFilter =
    isAdmin && typeof params.type === "string" ? params.type : "all";
  // Arriving from an owner's card ("Add another property") — the new
  // property is created already linked to that owner.
  const newOwnerParam = isAdmin ? params.newOwner : undefined;
  const newOwnerRow =
    typeof newOwnerParam === "string"
      ? await prisma.user.findFirst({
          where: { id: newOwnerParam, userType: UserType.owner },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : null;
  const newOwnerName = newOwnerRow
    ? [newOwnerRow.firstName, newOwnerRow.lastName].filter(Boolean).join(" ") ||
      newOwnerRow.email
    : undefined;

  // Shared by both the main list query and the "by management type" cards
  // below — the cards themselves always reflect every type (so they all
  // stay clickable at once), while the list itself also applies typeFilter.
  const baseWhere = isOwner
    ? { units: { some: { ownerId: user.id } } }
    : {
        // Admin's main list only shows live properties; unapproved
        // owner-submitted ones surface separately below for review.
        approved: true,
        ...(ownerFilter !== "all"
          ? { units: { some: { ownerId: ownerFilter } } }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                {
                  units: {
                    some: {
                      owner: {
                        OR: [
                          { email: { contains: search, mode: "insensitive" as const } },
                          { firstName: { contains: search, mode: "insensitive" as const } },
                          { lastName: { contains: search, mode: "insensitive" as const } },
                        ],
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      };

  const PAGE_SIZE = 25;
  const listWhere = {
    ...baseWhere,
    ...(typeFilter !== "all" ? { propertyTypeId: typeFilter } : {}),
  };
  const totalProperties = await prisma.property.count({ where: listWhere });
  const totalPages = Math.max(1, Math.ceil(totalProperties / PAGE_SIZE));
  const requestedPage = Number(typeof params.page === "string" ? params.page : "1");
  const currentPage = Math.min(
    totalPages,
    Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1),
  );

  const [properties, propertyTypeCounts, propertyTypes, pendingProperties, owners] =
    await Promise.all([
      prisma.property.findMany({
        where: listWhere,
        orderBy: { createdAt: "desc" },
        skip: (currentPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          propertyType: true,
          _count: { select: { units: true } },
          units: {
            select: {
              tenantId: true,
              owner: { select: { email: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
      prisma.property.findMany({
        where: baseWhere,
        select: {
          propertyType: { select: { id: true, name: true, label: true } },
        },
      }),
      prisma.propertyType.findMany({ orderBy: { createdAt: "asc" } }),
      isAdmin
        ? prisma.property.findMany({
            // Draft properties (owner still adding units, hasn't submitted
            // yet) don't belong in the review queue — only ones the owner
            // has actually asked to be reviewed.
            where: { approved: false, submittedAt: { not: null } },
            orderBy: { createdAt: "asc" },
            include: {
              propertyType: true,
              units: {
                select: { owner: { select: { email: true } } },
              },
            },
          })
        : Promise.resolve([]),
      isAdmin
        ? prisma.user.findMany({
            where: { userType: UserType.owner },
            select: { id: true, email: true, firstName: true, lastName: true },
            orderBy: { email: "asc" },
          })
        : Promise.resolve([]),
    ]);

  const totalUnits = properties.reduce((sum, p) => sum + p._count.units, 0);
  const totalOccupied = properties.reduce(
    (sum, p) => sum + p.units.filter((u) => u.tenantId).length,
    0,
  );

  // Spec #3's four management types (Owners Association, Building
  // Management, Individual Apartment Management, Villa/Call-Out) get their
  // own recognizable icon/color; any other admin-added type still gets a
  // card, just with a generic look, so this never silently drops one.
  const TYPE_STYLE: Record<string, { icon: LucideIcon; iconBg: string; accent: string }> = {
    building: { icon: Landmark, iconBg: "bg-indigo-50 text-indigo-600", accent: "bg-indigo-500" },
    building_management: { icon: Building2, iconBg: "bg-cyan-50 text-cyan-600", accent: "bg-cyan-500" },
    apartment: { icon: DoorOpen, iconBg: "bg-violet-50 text-violet-600", accent: "bg-violet-500" },
    villa: { icon: Phone, iconBg: "bg-amber-50 text-amber-600", accent: "bg-amber-500" },
    office: { icon: Briefcase, iconBg: "bg-slate-100 text-slate-600", accent: "bg-slate-400" },
  };
  const DEFAULT_TYPE_STYLE = {
    icon: Home,
    iconBg: "bg-teal-50 text-teal-600",
    accent: "bg-teal-500",
  };

  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (ownerFilter !== "all") query.set("owner", ownerFilter);
    if (search) query.set("q", search);
    if (typeFilter !== "all") query.set("type", typeFilter);
    if (page > 1) query.set("page", String(page));
    const qs = query.toString();
    return `/protected/properties${qs ? `?${qs}` : ""}`;
  };

  const buildTypeHref = (typeId: string) => {
    const query = new URLSearchParams();
    if (ownerFilter !== "all") query.set("owner", ownerFilter);
    if (search) query.set("q", search);
    if (typeId !== "all") query.set("type", typeId);
    const qs = query.toString();
    return `/protected/properties${qs ? `?${qs}` : ""}`;
  };

  const propertiesByType = Array.from(
    propertyTypeCounts.reduce((map, property) => {
      const key = property.propertyType.id;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
      } else {
        map.set(key, {
          id: property.propertyType.id,
          name: property.propertyType.name,
          label: property.propertyType.label,
          count: 1,
        });
      }
      return map;
    }, new Map<string, { id: string; name: string; label: string; count: number }>()).values(),
  ).sort((a, b) => b.count - a.count);

  /** A property's owners are the distinct set of its units' owners — several
   * units can belong to different landlords under the same building. */
  function distinctOwnerEmails(units: { owner: { email: string } | null }[]) {
    return Array.from(
      new Set(units.map((u) => u.owner?.email).filter(Boolean)),
    ) as string[];
  }

  return (
    <div className="w-full space-y-8 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Properties"
        description={`${properties.length} propert${
          properties.length === 1 ? "y" : "ies"
        } · ${totalOccupied} of ${totalUnits} units occupied`}
      >
        {isAdmin && (
          <>
            {(await adminAccess(user)).can("prop_owner_report") && <OwnerReportModal owners={owners} />}
            <ButtonLink href="/protected/admin/property-types" variant="outline">
              <Settings className="h-4 w-4" />
              Property types
            </ButtonLink>
          </>
        )}
      </PageHeader>

      <div className="flex flex-wrap gap-4">
        <Card className="relative w-full overflow-hidden border-border/60 shadow-sm sm:w-auto sm:min-w-56">
          <span className="absolute inset-x-0 top-0 h-1 bg-violet-500" />
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="whitespace-nowrap text-xs text-muted-foreground">
                Properties
              </p>
              <p className="text-2xl font-semibold">{properties.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="relative w-full overflow-hidden border-border/60 shadow-sm sm:w-auto sm:min-w-56">
          <span className="absolute inset-x-0 top-0 h-1 bg-[#0886be]" />
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0886be]/10 text-[#0886be]">
              <DoorOpen className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="whitespace-nowrap text-xs text-muted-foreground">
                Total units
              </p>
              <p className="text-2xl font-semibold">{totalUnits}</p>
            </div>
          </CardContent>
        </Card>
        <Link href="/protected/tenancies" className="block w-full sm:w-auto">
          <Card className="relative w-full overflow-hidden border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:min-w-56">
            <span className="absolute inset-x-0 top-0 h-1 bg-emerald-500" />
            <CardContent className="flex items-center gap-4 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Users className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="whitespace-nowrap text-xs text-muted-foreground">
                  Occupied
                </p>
                <p className="whitespace-nowrap text-2xl font-semibold">
                  {totalOccupied}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / {totalUnits}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {propertiesByType.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              By management type
            </p>
            {typeFilter !== "all" && (
              <Link
                href={buildTypeHref("all")}
                className="text-xs font-medium text-primary hover:underline"
              >
                Clear
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {propertiesByType.map((type) => {
              const style = TYPE_STYLE[type.name] ?? DEFAULT_TYPE_STYLE;
              const Icon = style.icon;
              const active = typeFilter === type.id;
              return (
                <Link
                  key={type.id}
                  href={buildTypeHref(active ? "all" : type.id)}
                  className="block w-full sm:w-auto"
                >
                  <Card
                    className={`relative w-full overflow-hidden shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:w-auto sm:min-w-40 ${
                      active
                        ? "border-transparent ring-2 ring-primary/60"
                        : "border-border/60"
                    }`}
                  >
                    <span className={`absolute inset-x-0 top-0 h-1 ${style.accent}`} />
                    <CardContent className="flex items-center gap-3 p-3.5">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.iconBg}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-lg font-semibold leading-tight">
                          {type.count}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {type.label}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {isAdmin && pendingProperties.length > 0 && (
        <Card className="relative overflow-hidden border-border/60 shadow-sm">
          <span className="absolute inset-x-0 top-0 h-1 bg-amber-500" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Building2 className="h-4 w-4" />
              </span>
              Pending properties
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                {pendingProperties.length} awaiting review
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingProperties.map((property) => (
              <div
                key={property.id}
                className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Link
                    href={`/protected/properties/${property.id}`}
                    className="font-medium hover:text-[#0886be] hover:underline"
                  >
                    {property.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {property.propertyType.label} ·{" "}
                    {formatOmanAddress(property)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Submitted by{" "}
                    {distinctOwnerEmails(property.units).join(", ") ||
                      "an unknown owner"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <ButtonLink
                    href={`/protected/properties/${property.id}`}
                    variant="outline"
                    size="sm"
                  >
                    View details
                  </ButtonLink>
                  <form action={approvePropertyAction}>
                    <input
                      type="hidden"
                      name="propertyId"
                      value={property.id}
                    />
                    <SubmitButton size="sm" pendingText="Approving...">
                      Approve
                    </SubmitButton>
                  </form>
                  <form
                    action={rejectPropertyAction}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="hidden"
                      name="propertyId"
                      value={property.id}
                    />
                    <Input
                      name="reason"
                      placeholder="Reason for rejecting *"
                      required
                      className="h-9 w-44"
                    />
                    <SubmitButton
                      size="sm"
                      variant="outline"
                      className="text-rose-700"
                      pendingText="Rejecting..."
                    >
                      Reject
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      {isAdmin && (
        <form className="flex flex-wrap items-end gap-2">
          {typeFilter !== "all" && (
            <input type="hidden" name="type" value={typeFilter} />
          )}
          <div className="min-w-56 flex-1 max-w-sm space-y-1.5">
            <Label htmlFor="q">Search</Label>
            <Input
              id="q"
              name="q"
              defaultValue={search}
              placeholder="Property name or owner…"
            />
          </div>
          <div className="w-full max-w-xs space-y-1.5">
            <Label htmlFor="owner">Property owner</Label>
            <Select id="owner" name="owner" defaultValue={ownerFilter}>
              <option value="all">All owners</option>
              {owners.map((owner) => {
                const name = [owner.firstName, owner.lastName]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <option key={owner.id} value={owner.id}>
                    {name ? `${name} · ${owner.email}` : owner.email}
                  </option>
                );
              })}
            </Select>
          </div>
          <SubmitButton variant="outline" pendingText="Filtering...">
            Filter
          </SubmitButton>
          {(ownerFilter !== "all" || search || typeFilter !== "all") && (
            <Link
              href="/protected/properties"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </Link>
          )}
        </form>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_27rem]">
        {/* The list column takes the height of the "Add a property" card next
         * to it: the wrapper reserves no height of its own, its content is
         * laid over the grid cell, and the scroll area fills what's left
         * above the pager — so the scroll bar is exactly as tall as the
         * form beside it. */}
        <div className="min-w-0 lg:relative lg:min-h-[34rem]">
          <div className="flex flex-col gap-3 lg:absolute lg:inset-0">
          {properties.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No properties yet"
              description="Add your first Oman property using the form, then add its units."
            />
          ) : (
            <div className="space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
            {properties.map((property) => {
              const occupied = property.units.filter((u) => u.tenantId).length;
              const total = property._count.units;
              const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
              const occupancyTone =
                pct === 100
                  ? {
                      pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
                      bar: "bg-emerald-500",
                    }
                  : pct > 0
                    ? {
                        pill: "bg-[#0886be]/10 text-[#0886be] ring-[#0886be]/20",
                        bar: "bg-[#0886be]",
                      }
                    : {
                        pill: "bg-slate-100 text-slate-600 ring-slate-500/20",
                        bar: "bg-slate-300",
                      };

              return (
                <Link
                  key={property.id}
                  href={`/protected/properties/${property.id}`}
                  className="block"
                >
                  <article className="group/card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:border-indigo-300 hover:shadow-md">
                    <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
                      <div className="flex min-w-0 flex-1 items-center gap-3.5">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                          <Building2 className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 className="truncate text-base font-semibold tracking-tight text-slate-900 group-hover/card:text-indigo-700">
                              {property.name}
                            </h3>
                            <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20">
                              {property.propertyType.label}
                            </span>
                            {!property.approved &&
                              (property.submittedAt ? (
                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-300">
                                  Pending approval
                                </span>
                              ) : property.rejectedAt ? (
                                <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800 ring-1 ring-inset ring-rose-300">
                                  Rejected
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-300">
                                  Draft
                                </span>
                              ))}
                          </div>
                          <p className="flex items-center gap-1.5 text-xs text-slate-500">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{formatOmanAddress(property)}</span>
                          </p>
                          {isAdmin && (
                            <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                              <KeyRound className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                              <span className="truncate">
                                {distinctOwnerEmails(property.units).length > 0
                                  ? distinctOwnerEmails(property.units).join(", ")
                                  : "No owner assigned"}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-5 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                        <div className="text-center">
                          <p className="text-lg font-semibold leading-none text-slate-900">{total}</p>
                          <p className="mt-1 text-[11px] font-medium text-slate-500">
                            {property.propertyType.unitNounPlural}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-semibold leading-none text-slate-900">{occupied}</p>
                          <p className="mt-1 text-[11px] font-medium text-slate-500">Occupied</p>
                        </div>
                        <div className="w-28">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-slate-500">Occupancy</span>
                            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${occupancyTone.pill}`}>
                              {pct}%
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                            <div className={`h-full rounded-full ${occupancyTone.bar}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <ChevronRight className="hidden h-5 w-5 shrink-0 text-slate-400 transition-colors group-hover/card:text-indigo-600 lg:block" />
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
            </div>
          )}

          {totalProperties > PAGE_SIZE && (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
              <p className="text-xs text-muted-foreground">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, totalProperties)} of {totalProperties}
              </p>
              <nav className="flex items-center gap-1" aria-label="Pagination">
                {currentPage > 1 ? (
                  <Link
                    href={pageHref(currentPage - 1)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border bg-background px-2.5 text-xs font-medium hover:bg-muted"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </Link>
                ) : (
                  <span className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs text-muted-foreground/50">
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </span>
                )}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (page) =>
                      page === 1 ||
                      page === totalPages ||
                      Math.abs(page - currentPage) <= 1,
                  )
                  .map((page, index, pages) => (
                    <span key={page} className="flex items-center gap-1">
                      {index > 0 && page - pages[index - 1] > 1 && (
                        <span className="px-1 text-xs text-muted-foreground">…</span>
                      )}
                      <Link
                        href={pageHref(page)}
                        aria-current={page === currentPage ? "page" : undefined}
                        className={
                          page === currentPage
                            ? "inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-primary px-2 text-xs font-semibold text-primary-foreground"
                            : "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border bg-background px-2 text-xs font-medium hover:bg-muted"
                        }
                      >
                        {page}
                      </Link>
                    </span>
                  ))}
                {currentPage < totalPages ? (
                  <Link
                    href={pageHref(currentPage + 1)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border bg-background px-2.5 text-xs font-medium hover:bg-muted"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <span className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs text-muted-foreground/50">
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </nav>
            </div>
          )}
          </div>
        </div>

        <Card className="h-fit overflow-hidden border-border/60 shadow-sm">
          <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white">
              <Plus className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-white">
              Add a property
            </h2>
          </div>
          <CardContent className="pt-5">
            <CreatePropertyForm
              defaultOwnerId={newOwnerRow?.id}
              defaultOwnerName={newOwnerName}
              propertyTypes={propertyTypes}
              isOwner={isOwner}
              isAdmin={isAdmin}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1.5 font-semibold">
        <span className="text-muted-foreground">{icon}</span>
        {value}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
