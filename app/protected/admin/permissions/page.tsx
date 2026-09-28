import { Shield } from "lucide-react";

import { saveAdminPermissionsAction, saveTenantPermissionsAction } from "@/app/permission-actions";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ADMIN_DOWNLOAD_PERMISSIONS,
  ADMIN_FEATURES,
  ADMIN_MODULES,
  ADMIN_PEOPLE_VISIBILITY,
} from "@/lib/admin-modules";
import { TENANT_MODULES } from "@/lib/tenant-modules";
import { grantedTenantModules, requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { personDisplayName } from "@/lib/utils";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export default async function PermissionsPage({ searchParams }: PageProps) {
  await requireSuperAdmin();
  const message = (await searchParams) as Message;

  const [admins, tenantGranted] = await Promise.all([
    prisma.user.findMany({
      where: { userType: { in: [UserType.admin, UserType.super_admin] } },
      orderBy: [{ userType: "desc" }, { firstName: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userType: true,
        adminModuleGrants: { select: { module: true } },
      },
    }),
    grantedTenantModules(),
  ]);

  return (
    <div className="w-full space-y-6 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Permissions"
        description="Choose which modules each admin can use, and which sections every tenant sees in their app."
      />
      <FormMessage message={message} />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">Tenants</p>
              <p className="text-sm text-muted-foreground">
                One set of sections for every tenant account. Untick a box and it
                disappears from all tenant sidebars.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-600/20">
              All tenants
            </span>
          </div>
          <form className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TENANT_MODULES.map((module) => (
                <label
                  key={module.key}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="modules"
                    value={module.key}
                    defaultChecked={tenantGranted.has(module.key)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium">{module.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {module.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <SubmitButton formAction={saveTenantPermissionsAction} pendingText="Saving...">
              Save tenant permissions
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      {admins.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            No admin accounts yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {admins.map((admin) => {
            const granted = new Set(admin.adminModuleGrants.map((row) => row.module));
            const isSuper = admin.userType === UserType.super_admin;
            const name = personDisplayName(admin) || admin.email;

            return (
              <Card key={admin.id}>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{name}</p>
                      <p className="text-sm text-muted-foreground">{admin.email}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-violet-700 ring-1 ring-violet-600/20">
                      <Shield className="h-3 w-3" />
                      {isSuper ? "Super admin" : "Admin"}
                    </span>
                  </div>

                  {isSuper ? (
                    <p className="text-sm text-muted-foreground">
                      Super admins have every module and this Permissions tab. Their access is not limited here.
                    </p>
                  ) : (
                    <form className="space-y-4">
                      <input type="hidden" name="userId" value={admin.id} />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Modules
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {ADMIN_MODULES.map((module) => (
                          <label
                            key={module.key}
                            className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              name="modules"
                              value={module.key}
                              defaultChecked={granted.has(module.key)}
                              className="mt-0.5"
                            />
                            <span>
                              <span className="block font-medium">{module.label}</span>
                              <span className="block text-xs text-muted-foreground">
                                {module.description}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="space-y-1 border-t pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Property page buttons
                        </p>
                        <p className="text-xs text-muted-foreground">
                          The report and record buttons on a property's page. Requires the Properties module.
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {ADMIN_FEATURES.map((module) => (
                          <label
                            key={module.key}
                            className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              name="modules"
                              value={module.key}
                              defaultChecked={granted.has(module.key)}
                              className="mt-0.5"
                            />
                            <span>
                              <span className="block font-medium">{module.label}</span>
                              <span className="block text-xs text-muted-foreground">
                                {module.description}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="space-y-1 border-t pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          People this admin can see
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Unticking a category hides it everywhere — the People list, and
                          every dropdown across the app that picks a tenant, owner or
                          worker (assigning a request, starting a tenancy, adding a
                          person, and so on).
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {ADMIN_PEOPLE_VISIBILITY.map((module) => (
                          <label
                            key={module.key}
                            className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              name="modules"
                              value={module.key}
                              defaultChecked={granted.has(module.key)}
                              className="mt-0.5"
                            />
                            <span>
                              <span className="block font-medium">{module.label}</span>
                              <span className="block text-xs text-muted-foreground">
                                {module.description}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="space-y-1 border-t pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Downloads
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Every "Download PDF" and "Download Excel" / "Export CSV"
                          button across the app, gated separately. The report or
                          statement itself stays visible either way — only the
                          download button disappears.
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {ADMIN_DOWNLOAD_PERMISSIONS.map((module) => (
                          <label
                            key={module.key}
                            className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              name="modules"
                              value={module.key}
                              defaultChecked={granted.has(module.key)}
                              className="mt-0.5"
                            />
                            <span>
                              <span className="block font-medium">{module.label}</span>
                              <span className="block text-xs text-muted-foreground">
                                {module.description}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <SubmitButton
                        formAction={saveAdminPermissionsAction}
                        pendingText="Saving..."
                      >
                        Save permissions
                      </SubmitButton>
                    </form>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
