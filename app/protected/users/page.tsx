import {
  FileText,
  IdCard,
  KeyRound,
  Search,
  Shield,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";

import {
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  updateUserProfileAction,
  updateUserTypeAction,
} from "@/app/admin-actions";
import { EmptyState } from "@/components/empty-state";
import { EntityDocumentManager } from "@/components/entity-document-manager";
import { AccountSection } from "@/components/account-section";
import { OwnerPortfolio, type OwnerPortfolioProperty } from "@/components/owner-portfolio";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PendingLink } from "@/components/ui/pending-link";
import { NewPersonFields } from "@/components/new-person-fields";
import { PhoneInput } from "@/components/phone-input";
import { RoleWorkerFields } from "@/components/role-worker-fields";
import { ManageToggle } from "@/components/manage-toggle";
import { WorkerHrBadge, WorkerHrModal } from "@/components/worker-hr-modal";
import { HrOverview } from "@/components/hr-overview";
import type { PickableUnit } from "@/components/unit-picker";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireRole, isStaffAdmin } from "@/lib/session";
import { canManagePermissions } from "@/lib/permissions";
import { UserType } from "@/lib/generated/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const ROLE_PILL: Record<UserType, string> = {
  admin: "bg-violet-50 text-violet-700 ring-violet-600/20",
  super_admin: "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-600/20",
  worker: "bg-[#0886be]/10 text-[#0886be] ring-[#0886be]/20",
  user: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  owner: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

const ROLE_LABEL: Record<UserType, string> = {
  admin: "Admin",
  super_admin: "Super admin",
  worker: "Worker",
  user: "Tenant",
  owner: "Property owner",
};

const ROLE_FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "user", label: "Tenants" },
  { value: "worker_in_house", label: "In House Workers" },
  { value: "worker_third_party", label: "3rd Party Vendors" },
  { value: "admin", label: "Admins" },
  { value: "super_admin", label: "Super admins" },
  { value: "owner", label: "Owners" },
] as const;

export default async function PeoplePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const message = params as unknown as Message;
  const admin = await requireRole(UserType.admin);
  const allowSuperAdmin = await canManagePermissions(admin);

  const query = params.query as string | undefined;
  const role = params.role as string | undefined;
  const newPersonRoleParam = params.newPersonRole as string | undefined;
  const newPersonRole =
    newPersonRoleParam &&
    (Object.values(UserType) as string[]).includes(newPersonRoleParam)
      ? newPersonRoleParam
      : "user";

  const andConditions: Prisma.UserWhereInput[] = [];

  if (query) {
    andConditions.push({
      OR: [
        { email: { contains: query, mode: "insensitive" } },
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
        { civilId: { contains: query, mode: "insensitive" } },
      ],
    });
  }

  if (role === "worker_in_house") {
    andConditions.push(
      { userType: UserType.worker },
      { OR: [{ workerCategory: "in_house" }, { workerCategory: null }] },
    );
  } else if (role === "worker_third_party") {
    andConditions.push({ userType: UserType.worker, workerCategory: "third_party" });
  } else if (role && role !== "all" && role in UserType) {
    andConditions.push({ userType: role as UserType });
  }

  const where: Prisma.UserWhereInput = andConditions.length
    ? { AND: andConditions }
    : {};

  const [users, emptyUnits, inHouseWorkers, roleCounts, propertyTypes] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        unit: { include: { property: { include: { propertyType: true } } } },
        documents: { orderBy: { createdAt: "desc" } },
        familyMembers: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.unit.findMany({
      where: { tenantId: null },
      orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
      include: { property: { include: { propertyType: true } } },
    }),
    // Independent of the search/role filters above — the HR overview always
    // reflects every in-house worker, not just the currently filtered list.
    prisma.user.findMany({
      where: { userType: UserType.worker, workerCategory: "in_house" },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: {
        documents: { orderBy: { createdAt: "desc" } },
        familyMembers: { orderBy: { createdAt: "asc" } },
      },
    }),
    // Unfiltered totals for the summary tiles — these always describe the
    // whole org, independent of whatever search/role filter is applied below.
    prisma.user.groupBy({ by: ["userType"], _count: true }),
    prisma.propertyType.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  // Owners' linked properties + every document attached to them — the same
  // property/unit document rows the property page manages.
  const ownerIds = users.filter((u) => u.userType === UserType.owner).map((u) => u.id);
  const ownedUnits = ownerIds.length
    ? await prisma.unit.findMany({
        where: { ownerId: { in: ownerIds } },
        orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
        include: {
          documents: { orderBy: { createdAt: "desc" } },
          property: {
            include: {
              propertyType: { select: { unitPrefix: true } },
              documents: { orderBy: { createdAt: "desc" } },
            },
          },
        },
      })
    : [];
  const portfolioByOwner = new Map<string, OwnerPortfolioProperty[]>();
  for (const unit of ownedUnits) {
    const list = portfolioByOwner.get(unit.ownerId!) ?? [];
    let entry = list.find((p) => p.id === unit.propertyId);
    if (!entry) {
      entry = {
        id: unit.propertyId,
        name: unit.property.name,
        propertyDocuments: unit.property.documents,
        units: [],
        unitLabelPrefix: unit.property.propertyType.unitPrefix,
      };
      list.push(entry);
    }
    entry.units.push({ id: unit.id, label: unit.label, documents: unit.documents });
    portfolioByOwner.set(unit.ownerId!, list);
  }

  const totalPeople = roleCounts.reduce((sum, r) => sum + r._count, 0);
  const countByType = (type: UserType) =>
    roleCounts.find((r) => r.userType === type)?._count ?? 0;

  const pickableUnits: PickableUnit[] = emptyUnits.map((unit) => ({
    id: unit.id,
    label: unit.label,
    propertyName: unit.property.name,
    propertyTypeId: unit.property.propertyTypeId,
    propertyTypeName: unit.property.propertyType.name,
    propertyTypeLabel: unit.property.propertyType.label,
    propertyTypeUnitNounSingular: unit.property.propertyType.unitNounSingular,
    propertyTypeUnitNounPlural: unit.property.propertyType.unitNounPlural,
    propertyTypeUnitPrefix: unit.property.propertyType.unitPrefix,
    propertyTypeShowRentBills: unit.property.propertyType.showRentBills,
  }));

  return (
    <div className="w-full space-y-8 px-4 pb-8 pt-4 sm:px-6 lg:px-8">
      <PageHeader
        title="People"
        description={`${totalPeople} account${totalPeople === 1 ? "" : "s"} across every role`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          icon={<Users className="h-5 w-5" />}
          value={totalPeople}
          label="Total accounts"
          accent="bg-slate-400"
          iconBg="bg-slate-50 text-slate-600"
        />
        <StatTile
          icon={<Shield className="h-5 w-5" />}
          value={countByType(UserType.admin) + countByType(UserType.super_admin)}
          label="Admins"
          accent="bg-violet-500"
          iconBg="bg-violet-50 text-violet-600"
        />
        <StatTile
          icon={<KeyRound className="h-5 w-5" />}
          value={countByType(UserType.owner)}
          label="Property owners"
          accent="bg-amber-500"
          iconBg="bg-amber-50 text-amber-600"
        />
        <StatTile
          icon={<Users className="h-5 w-5" />}
          value={countByType(UserType.user)}
          label="Tenants"
          accent="bg-emerald-500"
          iconBg="bg-emerald-50 text-emerald-600"
        />
        <StatTile
          icon={<UserCog className="h-5 w-5" />}
          value={countByType(UserType.worker)}
          label="Workers"
          accent="bg-[#0886be]"
          iconBg="bg-[#0886be]/10 text-[#0886be]"
        />
      </div>

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <HrOverview
        workers={inHouseWorkers.map((worker) => ({
          id: worker.id,
          name:
            [worker.firstName, worker.lastName].filter(Boolean).join(" ") ||
            worker.email,
          record: worker,
          documents: worker.documents,
          employeeType: worker.employeeType,
          familyMembers: worker.familyMembers,
        }))}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1">
              {ROLE_FILTERS.map((filter) => {
                const active =
                  filter.value === "all"
                    ? !role || role === "all"
                    : role === filter.value;

                return (
                  <PendingLink
                    key={filter.value}
                    href={`/protected/users?role=${filter.value}`}
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

            <form className="flex gap-2">
              <input type="hidden" name="role" value={role ?? "all"} />
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  name="query"
                  placeholder="Email, name, phone or Civil ID..."
                  defaultValue={query ?? ""}
                  className="pl-8 sm:w-56"
                />
              </div>
              <SubmitButton variant="outline" size="icon" pendingText="">
                <Search className="h-4 w-4" />
              </SubmitButton>
            </form>
          </div>

          {users.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No people found"
              description="Nobody matches these filters. Try clearing the search."
            />
          ) : (
            <div className="space-y-3 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto lg:pr-2">
              {users.map((user) => {
                const isSelf = user.id === admin.id;
                const name = [user.firstName, user.lastName]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <Card key={user.id} className="border-border/60 shadow-sm">
                    <CardContent className="flex flex-col gap-4 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                            {user.email.charAt(0).toUpperCase()}
                          </span>
                          <div className="space-y-0.5">
                            <p className="flex flex-wrap items-center gap-2 font-medium">
                              {user.email}
                              {isSelf && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                                  You
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {name || "No name set"}
                              {user.phone ? ` · ${user.phone}` : ""}
                            </p>
                            {(user.civilId ||
                              user.nationality ||
                              user.employer) && (
                              <p className="text-xs text-muted-foreground">
                                {user.civilId
                                  ? `Civil ID: ${user.civilId}`
                                  : ""}
                                {user.nationality
                                  ? ` · ${user.nationality}`
                                  : ""}
                                {user.employer ? ` · ${user.employer}` : ""}
                              </p>
                            )}
                            {(user.emergencyContactName ||
                              user.emergencyContactPhone) && (
                              <p className="text-xs text-muted-foreground">
                                Emergency:{" "}
                                {user.emergencyContactName || "Contact"}
                                {user.emergencyContactPhone
                                  ? ` · ${user.emergencyContactPhone}`
                                  : ""}
                              </p>
                            )}
                            {user.unit ? (
                              <p className="text-sm text-muted-foreground">
                                Lives in{" "}
                                <span className="font-medium text-foreground">
                                  {formatUnitLabel(
                                    user.unit.property.propertyType,
                                    user.unit.label,
                                  )}
                                </span>{" "}
                                · {user.unit.property.name}
                              </p>
                            ) : user.userType === UserType.user ? (
                              <p className="text-sm text-amber-700">
                                No unit assigned
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1 sm:shrink-0 sm:flex-col sm:items-end">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                              ROLE_PILL[user.userType]
                            }`}
                          >
                            {ROLE_LABEL[user.userType]}
                          </span>
                          {user.userType === UserType.worker && (
                            <span className="inline-flex items-center rounded-full bg-[#dc961e]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#dc961e] ring-1 ring-inset ring-[#dc961e]/20">
                              {user.workerCategory === "third_party"
                                ? user.companyName
                                  ? `3rd-party · ${user.companyName}`
                                  : "3rd-party"
                                : "In-house"}
                            </span>
                          )}
                          {user.userType === UserType.worker &&
                            user.workerCategory !== "third_party" && (
                              <WorkerHrBadge
                                record={user}
                                familyMembers={user.familyMembers}
                              />
                            )}
                        </div>
                      </div>

                      {user.userType === UserType.worker &&
                        user.workerCategory !== "third_party" && (
                          <div className="-mt-1">
                            <WorkerHrModal
                              userId={user.id}
                              record={user}
                              documents={user.documents}
                              employeeType={user.employeeType}
                              familyMembers={user.familyMembers}
                            />
                          </div>
                        )}

                      <ManageToggle label="Manage account">
                        <AccountSection
                          icon={<IdCard />}
                          tone="violet"
                          title="Oman identity & contact record"
                          subtitle="Contact details, Civil ID and mailing address"
                        >
                        <form className="space-y-3">
                          <input type="hidden" name="userId" value={user.id} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label
                                htmlFor={`first-${user.id}`}
                                className="text-xs"
                              >
                                First name
                              </Label>
                              <Input
                                id={`first-${user.id}`}
                                name="firstName"
                                defaultValue={user.firstName ?? ""}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label
                                htmlFor={`last-${user.id}`}
                                className="text-xs"
                              >
                                Last name
                              </Label>
                              <Input
                                id={`last-${user.id}`}
                                name="lastName"
                                defaultValue={user.lastName ?? ""}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label
                                htmlFor={`email-${user.id}`}
                                className="text-xs"
                              >
                                Email
                              </Label>
                              <Input
                                id={`email-${user.id}`}
                                name="email"
                                type="email"
                                defaultValue={user.email}
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <Label
                                htmlFor={`phone-${user.id}`}
                                className="text-xs"
                              >
                                Oman phone
                              </Label>
                              <PhoneInput
                                id={`phone-${user.id}`}
                                name="phone"
                                defaultValue={user.phone ?? ""}
                                placeholder="+968 9XXX XXXX"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <Label
                                htmlFor={`civil-${user.id}`}
                                className="text-xs"
                              >
                                Civil ID / Resident Card
                              </Label>
                              <Input
                                id={`civil-${user.id}`}
                                name="civilId"
                                defaultValue={user.civilId ?? ""}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label
                                htmlFor={`nationality-${user.id}`}
                                className="text-xs"
                              >
                                Nationality
                              </Label>
                              <Input
                                id={`nationality-${user.id}`}
                                name="nationality"
                                defaultValue={user.nationality ?? ""}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label
                                htmlFor={`employer-${user.id}`}
                                className="text-xs"
                              >
                                Employer / sponsor
                              </Label>
                              <Input
                                id={`employer-${user.id}`}
                                name="employer"
                                defaultValue={user.employer ?? ""}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label
                                htmlFor={`emergency-name-${user.id}`}
                                className="text-xs"
                              >
                                Emergency contact
                              </Label>
                              <Input
                                id={`emergency-name-${user.id}`}
                                name="emergencyContactName"
                                defaultValue={user.emergencyContactName ?? ""}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label
                                htmlFor={`emergency-phone-${user.id}`}
                                className="text-xs"
                              >
                                Emergency phone
                              </Label>
                              <PhoneInput
                                id={`emergency-phone-${user.id}`}
                                name="emergencyContactPhone"
                                defaultValue={user.emergencyContactPhone ?? ""}
                                placeholder="+968 9XXX XXXX"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label
                              htmlFor={`mailing-address-${user.id}`}
                              className="text-xs"
                            >
                              Mailing address
                            </Label>
                            <Textarea
                              id={`mailing-address-${user.id}`}
                              name="mailingAddress"
                              defaultValue={user.mailingAddress ?? ""}
                              className="min-h-16 text-xs"
                              placeholder="Used on owner service charge invoices"
                            />
                          </div>
                          <SubmitButton
                            formAction={updateUserProfileAction}
                            size="sm"
                            pendingText="Saving..."
                          >
                            Save profile
                          </SubmitButton>
                        </form>
                        </AccountSection>

                        {user.userType === UserType.owner && (
                          <OwnerPortfolio
                            ownerId={user.id}
                            ownerName={name || user.email}
                            propertyTypes={propertyTypes}
                            properties={portfolioByOwner.get(user.id) ?? []}
                          />
                        )}

                        <AccountSection
                          icon={<FileText />}
                          tone="sky"
                          title="Identity documents"
                          subtitle={`${user.documents.length} ${user.documents.length === 1 ? "document" : "documents"} · Civil ID, passport, resident card, visa, employment letter`}
                        >
                          <EntityDocumentManager
                            bare
                            documents={user.documents}
                            targetType="user"
                            targetId={user.id}
                            back="/protected/users"
                          />
                        </AccountSection>

                        {!isStaffAdmin(user.userType) && (
                          <AccountSection
                            icon={<KeyRound />}
                            tone="amber"
                            title="Reset password"
                            subtitle="Set a temporary password and share it securely"
                          >
                            <form className="space-y-3">
                              <input
                                type="hidden"
                                name="userId"
                                value={user.id}
                              />
                              <div className="space-y-1.5">
                                <Label
                                  htmlFor={`password-${user.id}`}
                                  className="text-xs"
                                >
                                  New temporary password
                                </Label>
                                <Input
                                  id={`password-${user.id}`}
                                  name="password"
                                  type="text"
                                  placeholder="At least 6 characters"
                                  minLength={6}
                                  autoComplete="new-password"
                                  required
                                />
                                <p className="text-xs text-muted-foreground">
                                  Existing passwords cannot be viewed. Set a
                                  new one here and share it securely with the
                                  user.
                                </p>
                              </div>
                              <SubmitButton
                                formAction={resetUserPasswordAction}
                                variant="outline"
                                size="sm"
                                pendingText="Resetting..."
                              >
                                <KeyRound className="h-4 w-4" />
                                Set temporary password
                              </SubmitButton>
                            </form>
                          </AccountSection>
                        )}

                        {!isSelf && (
                          <AccountSection
                            icon={<UserCog />}
                            tone="slate"
                            title="Account settings"
                            subtitle="Change this person's role or remove the account"
                          >
                          <div className="flex flex-wrap items-end gap-3">
                            <form className="flex items-end gap-2">
                              <input
                                type="hidden"
                                name="userId"
                                value={user.id}
                              />
                              <RoleWorkerFields
                                idPrefix={`role-${user.id}`}
                                roleSelectClassName="h-9 text-sm"
                                defaultRole={user.userType}
                                defaultWorkerCategory={
                                  user.workerCategory ?? "in_house"
                                }
                                defaultCompanyName={user.companyName ?? ""}
                                allowSuperAdmin={allowSuperAdmin}
                              />
                              <SubmitButton
                                formAction={updateUserTypeAction}
                                variant="outline"
                                size="sm"
                                pendingText="Saving..."
                              >
                                Update role
                              </SubmitButton>
                            </form>

                            <form className="ml-auto">
                              <input
                                type="hidden"
                                name="userId"
                                value={user.id}
                              />
                              <SubmitButton
                                formAction={deleteUserAction}
                                variant="ghost"
                                size="sm"
                                pendingText="Deleting..."
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </SubmitButton>
                            </form>
                          </div>
                          </AccountSection>
                        )}
                      </ManageToggle>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Create a user ────────────────────────────────────────────────── */}
        <Card
          id="add-person"
          className="h-fit overflow-hidden border-border/60 shadow-sm lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
        >
          <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-white">
              <UserPlus className="h-4 w-4" />
            </span>
            <CardTitle className="text-base text-white">Add a person</CardTitle>
          </div>
          <CardContent className="pt-6">
            <form id="new-person-form" className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  name="email"
                  type="email"
                  placeholder="person@example.com"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password">Temporary password</Label>
                <Input
                  id="new-password"
                  name="password"
                  type="text"
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                />
              </div>

              <NewPersonFields
                units={pickableUnits}
                initialRole={newPersonRole}
                allowSuperAdmin={allowSuperAdmin}
              />

              <SubmitButton
                formAction={createUserAction}
                className="w-full"
                pendingText="Creating..."
              >
                Create account
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  value,
  label,
  accent,
  iconBg,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  accent: string;
  iconBg: string;
}) {
  return (
    <Card className="relative overflow-hidden border-border/60 shadow-sm">
      <span className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <CardContent className="flex items-center gap-4 p-5">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="whitespace-nowrap text-xs text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
