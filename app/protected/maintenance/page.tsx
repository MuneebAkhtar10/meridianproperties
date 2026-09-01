import { ClipboardList, Home, Paperclip, Search } from "lucide-react";
import Link from "next/link";

import { AdminRequestCard } from "@/components/admin-request-card";
import { EmptyState } from "@/components/empty-state";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PendingLink } from "@/components/ui/pending-link";
import { prisma } from "@/lib/prisma";
import { requireAnyRole } from "@/lib/session";
import { RequestStatus, UserType } from "@/lib/generated/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "en_route", label: "En Route" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
] as const;

export default async function AllRequestsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const message = params as unknown as Message;
  const user = await requireAnyRole(UserType.admin, UserType.owner);
  const isOwner = user.userType === UserType.owner;

  const status = params.status as string | undefined;
  const propertyId = params.property as string | undefined;
  const query = params.query as string | undefined;

  const where: Prisma.MaintenanceRequestWhereInput = {};

  if (status && status !== "all" && status in RequestStatus) {
    where.status = status as RequestStatus;
  }

  if (propertyId && propertyId !== "all") {
    where.unit = { propertyId };
  }

  // An owner only ever sees requests for units in properties they own.
  if (isOwner) {
    where.unit = { ...where.unit, property: { ownerId: user.id } };
  }

  if (query) {
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
    ];
  }

  const [requests, workers, properties] = await Promise.all([
    prisma.maintenanceRequest.findMany({
      where,
      orderBy:
        status === RequestStatus.on_hold
          ? [{ resumeRequestedAt: "asc" }, { heldAt: "asc" }]
          : { createdAt: "desc" },
      include: {
        user: { select: { email: true } },
        unit: {
          include: {
            property: {
              select: {
                name: true,
                propertyType: { select: { hasFloors: true, unitPrefix: true } },
              },
            },
          },
        },
        attachments: true,
        supplyRequests: {
          orderBy: { createdAt: "asc" },
          include: {
            requestedBy: { select: { email: true } },
            decidedBy: { select: { email: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { userType: UserType.worker },
      select: { id: true, email: true },
      orderBy: { email: "asc" },
    }),
    prisma.property.findMany({
      where: isOwner ? { ownerId: user.id } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const buildHref = (next: Record<string, string>) => {
    const search = new URLSearchParams({
      status: status ?? "all",
      property: propertyId ?? "all",
      ...(query ? { query } : {}),
      ...next,
    });
    return `/protected/maintenance?${search.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <PageHeader
        title="Maintenance requests"
        description={`${requests.length} request${
          requests.length === 1 ? "" : "s"
        } matching your filters`}
      />

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((filter) => {
            const active =
              filter.value === "all"
                ? !status || status === "all"
                : status === filter.value;

            return (
              <PendingLink
                key={filter.value}
                href={buildHref({ status: filter.value })}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {filter.label}
              </PendingLink>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {/* Changing the property re-submits with the current status kept. */}
          <form className="flex gap-2">
            <input type="hidden" name="status" value={status ?? "all"} />
            <Select
              name="property"
              defaultValue={propertyId ?? "all"}
              className="sm:w-48"
              aria-label="Filter by property"
            >
              <option value="all">All properties</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </Select>
            <SubmitButton variant="outline" size="sm" pendingText="...">
              Filter
            </SubmitButton>
          </form>

          <form className="flex gap-2">
            <input type="hidden" name="status" value={status ?? "all"} />
            <input type="hidden" name="property" value={propertyId ?? "all"} />
            <Input
              type="search"
              name="query"
              placeholder="Search requests..."
              defaultValue={query ?? ""}
              className="sm:w-52"
            />
            <SubmitButton variant="outline" size="icon" pendingText="">
              <Search className="h-4 w-4" />
            </SubmitButton>
          </form>
        </div>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No requests found"
          description="Nothing matches these filters yet."
        />
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <AdminRequestCard
              key={`${request.id}-${request.status}-${request.assignedToId ?? ""}`}
              request={request}
              workers={workers}
              attachments={request.attachments}
            />
          ))}
        </div>
      )}
    </div>
  );
}
