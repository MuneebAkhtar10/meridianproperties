"use client";

import { useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { VisibleRoles } from "@/components/new-person-fields";

/**
 * Role select + the worker-only fields that go with it (worker type, and the
 * company name that only applies to 3rd-party workers). Client-side so the
 * extra fields only appear once "Worker" is actually picked, and the company
 * field only appears once "3rd-party" is picked — the surrounding <form>
 * still just sees plain `userType` / `workerCategory` / `companyName` fields.
 */
export function RoleWorkerFields({
  idPrefix,
  roleSelectClassName,
  defaultRole = "user",
  defaultWorkerCategory = "in_house",
  defaultCompanyName = "",
  roleLabel = "Role",
  allowSuperAdmin = false,
  visibleRoles = { tenant: true, workerInHouse: true, workerThirdParty: true, owner: true },
  children,
}: {
  idPrefix: string;
  roleSelectClassName?: string;
  defaultRole?: string;
  defaultWorkerCategory?: string;
  defaultCompanyName?: string;
  roleLabel?: string;
  allowSuperAdmin?: boolean;
  /** Which role/worker-type options to offer, from this admin's People
   * visibility grants. */
  visibleRoles?: VisibleRoles;
  children?: ReactNode;
}) {
  const [role, setRole] = useState(defaultRole);
  const [workerCategory, setWorkerCategory] = useState(defaultWorkerCategory);

  const isWorker = role === "worker";
  const isThirdParty = isWorker && workerCategory === "third_party";

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-role`} className="text-xs">
          {roleLabel}
        </Label>
        <Select
          id={`${idPrefix}-role`}
          name="userType"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className={roleSelectClassName}
        >
          {visibleRoles.tenant && <option value="user">Tenant</option>}
          {(visibleRoles.workerInHouse || visibleRoles.workerThirdParty) && (
            <option value="worker">Worker</option>
          )}
          <option value="admin">Admin</option>
          {allowSuperAdmin && <option value="super_admin">Super admin</option>}
          {visibleRoles.owner && <option value="owner">Property owner</option>}
        </Select>
      </div>

      {isWorker && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-worker-category`} className="text-xs">
            Worker type
          </Label>
          <Select
            id={`${idPrefix}-worker-category`}
            name="workerCategory"
            value={workerCategory}
            onChange={(event) => setWorkerCategory(event.target.value)}
            className={roleSelectClassName}
          >
            {visibleRoles.workerInHouse && <option value="in_house">In-house</option>}
            {visibleRoles.workerThirdParty && (
              <option value="third_party">3rd-party</option>
            )}
          </Select>
        </div>
      )}

      {isThirdParty && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-company-name`} className="text-xs">
            Company
          </Label>
          <Input
            id={`${idPrefix}-company-name`}
            name="companyName"
            defaultValue={defaultCompanyName}
            placeholder="Vendor name"
            className={roleSelectClassName}
          />
        </div>
      )}

      {children}
    </>
  );
}
