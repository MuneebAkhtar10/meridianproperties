"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

import { startTenancyAction } from "@/app/finance-actions";
import { SubmitButton } from "@/components/submit-button";
import {
  UploadBudgetProvider,
  UploadFileInput,
} from "@/components/upload-file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UnitPicker, type PickableUnit } from "@/components/unit-picker";
import { dateInputValue } from "@/lib/finance";
import { defaultUnitPermissions } from "@/lib/property-types";
import { TenancyPurpose } from "@/lib/generated/prisma/client";

/**
 * Spec #24 "Tenant Agreement Form" — its own client component so the two
 * charge checkboxes can react to the property type chosen in UnitPicker (a
 * "Building" type, e.g. an owners' association, defaults both off — no
 * rent/bills there, same rule as a unit's own rentBillsEnabled default).
 */
export function StartTenancyForm({
  availableTenants,
  pickableUnits,
}: {
  availableTenants: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }[];
  pickableUnits: PickableUnit[];
}) {
  const [chargeDefaultsEnabled, setChargeDefaultsEnabled] = useState(true);
  const [createFirstRent, setCreateFirstRent] = useState(true);
  const [createDepositCharge, setCreateDepositCharge] = useState(true);

  return (
    <UploadBudgetProvider>
      <form className="space-y-4" encType="multipart/form-data">
        <h3 className="text-sm font-semibold">Tenant Agreement Form</h3>
        <div className="rounded-lg border border-[#0886be]/25 bg-[#0886be]/10 p-3 text-xs text-[#075e82]">
          Oman record checklist: keep the tenant Civil ID under People, title
          deed/plot under Property, and add the municipality contract below.
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
          onPropertyTypeChange={(propertyTypeName) => {
            const enabled = propertyTypeName
              ? defaultUnitPermissions(propertyTypeName).rentBillsEnabled
              : true;
            setChargeDefaultsEnabled(enabled);
            setCreateFirstRent(enabled);
            setCreateDepositCharge(enabled);
          }}
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

        <Field label="Paid by">
          <Input
            name="paidBy"
            placeholder="e.g. the tenant themselves, or a sponsoring employer"
          />
        </Field>

        <Field label="Lease purpose">
          <Select name="purpose" defaultValue={TenancyPurpose.residential}>
            <option value={TenancyPurpose.residential}>Residential</option>
            <option value={TenancyPurpose.commercial}>Commercial</option>
          </Select>
        </Field>

        <StartFormHeading>Parking</StartFormHeading>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Parking slot number">
            <Input name="parkingSlotNumber" placeholder="e.g. P-14" />
          </Field>
          <Field label="Vehicle plate number">
            <Input name="vehiclePlateNumber" placeholder="e.g. 12345 / A" />
          </Field>
        </div>
        <Field label="Vehicle details">
          <Input
            name="vehicleDetails"
            placeholder="Make, model, colour…"
          />
        </Field>
        <Field label="Parking agreement document">
          <UploadFileInput name="parkingAgreementDocuments" multiple />
        </Field>

        <StartFormHeading>Oman registration</StartFormHeading>

        <Field label="Agreement number">
          <Input
            name="agreementRef"
            placeholder="e.g. 20260048714"
          />
        </Field>
        <Field label="Agreement start date">
          <Input name="agreementStartDate" type="date" />
          <p className="text-xs text-muted-foreground">
            Only set this if the signed agreement's own start date differs
            from move-in above.
          </p>
        </Field>
        <Field label="Signed tenancy agreement">
          <UploadFileInput name="tenancyAgreementDocuments" multiple />
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
            checked={createFirstRent}
            onChange={(e) => setCreateFirstRent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
          />
          <span>
            Create first rent charge
            <span className="block text-xs text-muted-foreground">
              Uses the move-in month.
              {!chargeDefaultsEnabled &&
                " Off by default for this property type."}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="createDepositCharge"
            checked={createDepositCharge}
            onChange={(e) => setCreateDepositCharge(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
          />
          <span>
            Create deposit charge
            <span className="block text-xs text-muted-foreground">
              Skipped when deposit is zero.
              {!chargeDefaultsEnabled &&
                " Off by default for this property type."}
            </span>
          </span>
        </label>

        <SubmitButton
          formAction={startTenancyAction}
          className="w-full"
          pendingText="Creating..."
        >
          <KeyRound className="h-4 w-4" />
          Create Tenant Agreement
        </SubmitButton>
      </form>
    </UploadBudgetProvider>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StartFormHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}
