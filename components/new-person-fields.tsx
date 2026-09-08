"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PhoneInput } from "@/components/phone-input";
import { UnitPicker, type PickableUnit } from "@/components/unit-picker";
import { NewWorkerHrModal } from "@/components/worker-hr-modal";

/**
 * The whole "Add a person" form body below the email/password fields: role +
 * worker-only fields, then name/phone/unit/etc. All one client component (not
 * split via a render-prop) because a function can't be passed as a prop from
 * a Server Component — it has to be defined inside the client boundary.
 */
export function NewPersonFields({
  units,
  initialRole = "user",
}: {
  units: PickableUnit[];
  /** Preselects the role — e.g. arriving here from the property form's
   * "create an owner first" link with `?newPersonRole=owner`. */
  initialRole?: string;
}) {
  const [role, setRole] = useState(initialRole);
  const [workerCategory, setWorkerCategory] = useState("in_house");

  const isWorker = role === "worker";
  const isThirdParty = isWorker && workerCategory === "third_party";
  const isTenant = role === "user";

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="new-role">Role</Label>
        <Select
          id="new-role"
          name="userType"
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="user">Tenant</option>
          <option value="worker">Worker</option>
          <option value="admin">Admin</option>
          <option value="owner">Property owner</option>
        </Select>
      </div>

      {isWorker && (
        <div className="space-y-1.5">
          <Label htmlFor="new-worker-category">Worker type</Label>
          <Select
            id="new-worker-category"
            name="workerCategory"
            value={workerCategory}
            onChange={(event) => setWorkerCategory(event.target.value)}
          >
            <option value="in_house">In-house</option>
            <option value="third_party">3rd-party</option>
          </Select>
        </div>
      )}

      {isThirdParty && (
        <div className="space-y-1.5">
          <Label htmlFor="new-company-name">Company</Label>
          <Input
            id="new-company-name"
            name="companyName"
            placeholder="Vendor name"
          />
        </div>
      )}

      {isWorker && workerCategory === "in_house" && (
        <NewWorkerHrModal formId="new-person-form" />
      )}

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
          required
        />
      </div>

      {isTenant && (
        <div className="space-y-1.5 rounded-lg border bg-muted/10 p-3">
          <Label>Unit</Label>
          <UnitPicker id="unitId" name="unitId" units={units} />
          <p className="text-xs text-muted-foreground">
            If selected, complete the rent and lease terms under Tenancies.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="civilId">Civil ID / Resident Card</Label>
          <Input id="civilId" name="civilId" placeholder="Optional" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nationality">Nationality</Label>
          <Input id="nationality" name="nationality" placeholder="Omani" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="employer">Employer / sponsor</Label>
        <Input id="employer" name="employer" placeholder="Optional" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="emergencyContactName">Emergency contact</Label>
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
    </>
  );
}
