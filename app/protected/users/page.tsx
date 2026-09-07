import {
  FileText,
  IdCard,
  KeyRound,
  Search,
  Trash2,
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
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const ROLE_PILL: Record<UserType, string> = {
  admin: "bg-violet-50 text-violet-700 ring-violet-600/20",
  worker: "bg-[#0886be]/10 text-[#0886be] ring-[#0886be]/20",
  user: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  owner: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

const ROLE_LABEL: Record<UserType, string> = {
  admin: "Admin",
  worker: "Worker",
  user: "Tenant",
  owner: "Property owner",
};

const ROLE_FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "user", label: "Tenants" },
  { value: "worker", label: "Workers" },
  { value: "admin", label: "Admins" },
  { value: "owner", label: "Owners" },
] as const;

export default async function PeoplePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const message = params as unknown as Message;
  const admin = await requireRole(UserType.admin);

  const query = params.query as string | undefined;
  const role = params.role as string | undefined;

  const where: Prisma.UserWhereInput = {};

  if (query) {
    where.OR = [
      { email: { contains: query, mode: "insensitive" } },
      { firstName: { contains: query, mode: "insensitive" } },
      { lastName: { contains: query, mode: "insensitive" } },
      { phone: { contains: query, mode: "insensitive" } },
      { civilId: { contains: query, mode: "insensitive" } },
    ];
  }

  if (role && role !== "all" && role in UserType) {
    where.userType = role as UserType;
  }

  const [users, emptyUnits, inHouseWorkers] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        unit: { include: { property: { include: { propertyType: true } } } },
        documents: { orderBy: { createdAt: "desc" } },
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
      include: { documents: { orderBy: { createdAt: "desc" } } },
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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <PageHeader
        title="People"
        description={`${users.length} account${users.length === 1 ? "" : "s"}`}
      />

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
        }))}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
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
            <div className="space-y-3">
              {users.map((user) => {
                const isSelf = user.id === admin.id;
                const name = [user.firstName, user.lastName]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <Card key={user.id} className="border-border/60 shadow-sm">
                    <CardContent className="flex flex-col gap-4 p-5">
                      <div className="flex items-start justify-between gap-3">
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

                        <div className="flex shrink-0 flex-col items-end gap-1">
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
                              <WorkerHrBadge record={user} />
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
                            />
                          </div>
                        )}

                      <ManageToggle label="Manage account">
                        <div className="space-y-2">
                          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <IdCard className="h-3.5 w-3.5" />
                            Oman identity & contact record
                          </p>
                        <form className="space-y-3 rounded-lg border border-border/60 bg-background p-3">
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
                          <SubmitButton
                            formAction={updateUserProfileAction}
                            size="sm"
                            pendingText="Saving..."
                          >
                            Save profile
                          </SubmitButton>
                        </form>
                        </div>

                        <div className="space-y-2">
                          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <FileText className="h-3.5 w-3.5" />
                            Identity documents
                            <span className="font-normal normal-case text-muted-foreground/70">
                              ({user.documents.length})
                            </span>
                          </p>
                          <div className="rounded-lg border border-border/60 bg-background p-3">
                            <EntityDocumentManager
                              documents={user.documents}
                              targetType="user"
                              targetId={user.id}
                              back="/protected/users"
                              title="Personal documents"
                              description="Civil ID, passport, resident card, visa and employment or sponsor documents."
                            />
                          </div>
                        </div>

                        {user.userType !== UserType.admin && (
                          <div className="space-y-2">
                            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <KeyRound className="h-3.5 w-3.5" />
                              Reset password
                            </p>
                            <form className="space-y-3 rounded-lg border border-border/60 bg-background p-3">
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
                          </div>
                        )}

                        {!isSelf && (
                          <div className="flex flex-wrap items-end gap-3 border-t pt-4">
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
        <Card className="h-fit overflow-hidden border-border/60 shadow-sm lg:sticky lg:top-24">
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

              <NewPersonFields units={pickableUnits} />

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
