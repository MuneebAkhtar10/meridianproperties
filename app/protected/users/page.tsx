import { KeyRound, Search, Trash2, UserPlus, Users } from "lucide-react";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PendingLink } from "@/components/ui/pending-link";
import { PhoneInput } from "@/components/phone-input";
import { UnitPicker, type PickableUnit } from "@/components/unit-picker";
import { formatUnitLabel } from "@/lib/property-types";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

const ROLE_PILL: Record<UserType, string> = {
  admin: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  worker: "bg-teal-50 text-teal-700 ring-teal-600/20",
  user: "bg-slate-50 text-slate-600 ring-slate-500/20",
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

  const [users, emptyUnits] = await Promise.all([
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

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <Input
                type="search"
                name="query"
                placeholder="Email, name, phone or Civil ID..."
                defaultValue={query ?? ""}
                className="sm:w-56"
              />
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
                  <Card key={user.id}>
                    <CardContent className="flex flex-col gap-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
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

                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                            ROLE_PILL[user.userType]
                          }`}
                        >
                          {ROLE_LABEL[user.userType]}
                        </span>
                      </div>

                      <details className="group rounded-lg border">
                        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium">
                          Edit Oman identity & contact record
                          <span className="float-right text-xs font-normal text-muted-foreground group-open:hidden">
                            Open
                          </span>
                        </summary>
                        <form className="space-y-3 border-t p-3">
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
                      </details>

                      <details className="group rounded-lg border">
                        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium">
                          Identity documents
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {user.documents.length}
                          </span>
                          <span className="float-right text-xs font-normal text-muted-foreground group-open:hidden">
                            Open
                          </span>
                        </summary>
                        <div className="border-t p-3">
                          <EntityDocumentManager
                            documents={user.documents}
                            targetType="user"
                            targetId={user.id}
                            back="/protected/users"
                            title="Personal documents"
                            description="Civil ID, passport, resident card, visa and employment or sponsor documents."
                          />
                        </div>
                      </details>

                      {user.userType !== UserType.admin && (
                        <details className="group rounded-lg border">
                          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium">
                            <span className="inline-flex items-center gap-2">
                              <KeyRound className="h-4 w-4" />
                              Reset password
                            </span>
                            <span className="float-right text-xs font-normal text-muted-foreground group-open:hidden">
                              Open
                            </span>
                          </summary>
                          <form className="space-y-3 border-t p-3">
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
                                Existing passwords cannot be viewed. Set a new
                                one here and share it securely with the user.
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
                        </details>
                      )}

                      {!isSelf && (
                        <div className="flex flex-wrap items-end gap-3 border-t pt-4">
                          <form className="flex items-end gap-2">
                            <input
                              type="hidden"
                              name="userId"
                              value={user.id}
                            />
                            <div className="space-y-1.5">
                              <Label
                                htmlFor={`role-${user.id}`}
                                className="text-xs"
                              >
                                Role
                              </Label>
                              <Select
                                id={`role-${user.id}`}
                                name="userType"
                                defaultValue={user.userType}
                                className="h-9 w-36 text-sm"
                              >
                                <option value="user">Tenant</option>
                                <option value="worker">Worker</option>
                                <option value="admin">Admin</option>
                                <option value="owner">Property owner</option>
                              </Select>
                            </div>
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
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Create a user ────────────────────────────────────────────────── */}
        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4" />
              Add a person
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4">
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

              <div className="space-y-1.5">
                <Label htmlFor="new-role">Role</Label>
                <Select id="new-role" name="userType" defaultValue="user">
                  <option value="user">Tenant</option>
                  <option value="worker">Worker</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Property owner</option>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input id="firstName" name="firstName" placeholder="Ali" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" name="lastName" placeholder="Khan" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <PhoneInput
                  id="phone"
                  name="phone"
                  placeholder="+968 9XXX XXXX"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="civilId">Civil ID / Resident Card</Label>
                  <Input id="civilId" name="civilId" placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nationality">Nationality</Label>
                  <Input
                    id="nationality"
                    name="nationality"
                    placeholder="Omani"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="employer">Employer / sponsor</Label>
                <Input id="employer" name="employer" placeholder="Optional" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="emergencyContactName">
                    Emergency contact
                  </Label>
                  <Input
                    id="emergencyContactName"
                    name="emergencyContactName"
                    placeholder="Name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emergencyContactPhone">Emergency phone</Label>
                  <PhoneInput
                    id="emergencyContactPhone"
                    name="emergencyContactPhone"
                    placeholder="+968 9XXX XXXX"
                  />
                </div>
              </div>

              <div className="space-y-1.5 rounded-lg border bg-muted/10 p-3">
                <Label>Unit (tenants only)</Label>
                <UnitPicker id="unitId" name="unitId" units={pickableUnits} />
                <p className="text-xs text-muted-foreground">
                  Ignored for workers/admins. If selected, complete the rent and
                  lease terms under Tenancies.
                </p>
              </div>

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
