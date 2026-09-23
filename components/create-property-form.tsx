"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { createPropertyAction } from "@/app/admin-actions";
import { PropertyLocationFields } from "@/components/property-location-fields";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { OMAN_GOVERNORATES } from "@/lib/oman";
import {
  isBuildingType,
  isIndependentType,
  type PropertyManagementFlags,
} from "@/lib/property-types";

export type CreatePropertyTypeOption = PropertyManagementFlags & {
  id: string;
  label: string;
  unitNounSingular: string;
  unitPrefix: string | null;
  hasFloors: boolean;
  hasBedrooms: boolean;
};

export function CreatePropertyForm({
  propertyTypes,
  isOwner,
  isAdmin,
}: {
  propertyTypes: CreatePropertyTypeOption[];
  isOwner: boolean;
  isAdmin: boolean;
}) {
  const [typeId, setTypeId] = useState(propertyTypes[0]?.id ?? "");
  const selected = useMemo(
    () => propertyTypes.find((type) => type.id === typeId) ?? null,
    [propertyTypes, typeId],
  );
  const independent = selected ? isIndependentType(selected) : false;
  const oa = selected ? isBuildingType(selected) : false;
  const unitNoun = selected?.unitNounSingular.toLowerCase() ?? "unit";

  if (propertyTypes.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        No property types yet.{" "}
        {isAdmin ? (
          <>
            <Link
              href="/protected/admin/property-types"
              className="font-medium underline"
            >
              Add one first
            </Link>{" "}
            before creating a property.
          </>
        ) : (
          "Ask an administrator to add a property type first."
        )}
      </p>
    );
  }

  return (
    <form className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Property name</Label>
        <Input
          id="name"
          name="name"
          placeholder="Al Khuwair Heights"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="type">Property type</Label>
        <Select
          id="type"
          name="propertyTypeId"
          value={typeId}
          onChange={(event) => setTypeId(event.target.value)}
          required
        >
          {propertyTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          {independent
            ? "Independent properties have exactly one unit — capture it here."
            : oa
              ? "Owners’ association properties need the OA registration number."
              : "Floors and unit labels come from this type."}
          {isAdmin ? (
            <>
              {" "}
              <Link href="/protected/admin/property-types" className="underline">
                Manage types
              </Link>
              .
            </>
          ) : null}
        </p>
      </div>

      {oa ? (
        <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3">
          <Label htmlFor="associationRegistrationNumber">OA number</Label>
          <Input
            id="associationRegistrationNumber"
            name="associationRegistrationNumber"
            placeholder="e.g. OA-214 / registration no."
            required
          />
          <p className="text-xs text-muted-foreground">
            Printed on service-charge invoices as the association registration.
          </p>
        </div>
      ) : null}

      {independent && selected ? (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <div>
            <p className="text-sm font-semibold">The {unitNoun}</p>
            <p className="text-xs text-muted-foreground">
              Independent properties hold a single {unitNoun}. Extra units cannot
              be added later.
            </p>
          </div>
          <div
            className={`grid gap-3 ${
              selected.hasFloors && selected.hasBedrooms
                ? "sm:grid-cols-2"
                : "grid-cols-1"
            }`}
          >
            <div className="space-y-1.5">
              <Label htmlFor="unitLabel">{selected.unitNounSingular} number</Label>
              <Input
                id="unitLabel"
                name="unitLabel"
                placeholder={
                  selected.hasFloors
                    ? "101"
                    : selected.unitPrefix
                      ? `${selected.unitPrefix} 1`
                      : `${selected.unitNounSingular} 1`
                }
                required
              />
            </div>
            {selected.hasFloors ? (
              <div className="space-y-1.5">
                <Label htmlFor="unitFloor">Floor</Label>
                <Input id="unitFloor" name="unitFloor" type="number" placeholder="1" />
              </div>
            ) : null}
            {selected.hasBedrooms ? (
              <div className="space-y-1.5">
                <Label htmlFor="unitBedrooms">Beds</Label>
                <Input
                  id="unitBedrooms"
                  name="unitBedrooms"
                  type="number"
                  min={0}
                  placeholder="3"
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="unitEntitlements">Entitlement (m²)</Label>
              <Input
                id="unitEntitlements"
                name="unitEntitlements"
                type="number"
                min={0}
                placeholder="e.g. 220"
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="address">Address / locality</Label>
        <Input
          id="address"
          name="address"
          placeholder="Al Khuwair 33"
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="governorate">Governorate</Label>
          <Select id="governorate" name="governorate" defaultValue="Muscat">
            {OMAN_GOVERNORATES.map((governorate) => (
              <option key={governorate} value={governorate}>
                {governorate}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wilayat">Wilayat</Label>
          <Input id="wilayat" name="wilayat" placeholder="Bawshar" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="area">Area / village</Label>
        <Input id="area" name="area" placeholder="Al Khuwair" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="buildingName">Building name/no.</Label>
          <Input
            id="buildingName"
            name="buildingName"
            placeholder="Al Noor Tower"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wayNumber">Way no.</Label>
          <Input id="wayNumber" name="wayNumber" placeholder="3521" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="buildingNumber">Building no.</Label>
          <Input id="buildingNumber" name="buildingNumber" placeholder="214" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="postalCode">Postal code</Label>
          <Input id="postalCode" name="postalCode" placeholder="133" />
        </div>
      </div>

      <PropertyLocationFields />

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" placeholder="Optional" />
      </div>

      {isOwner && (
        <p className="text-xs text-muted-foreground">
          {independent
            ? "Your property will be reviewed by an administrator before it appears anywhere else. You’ll be assigned as this unit’s owner."
            : "Your property will be reviewed by an administrator before it appears anywhere else. Add its units next — you’ll be assigned as the owner of each one you add."}
        </p>
      )}

      <SubmitButton
        formAction={createPropertyAction}
        className="w-full"
        pendingText="Creating..."
      >
        Create property
      </SubmitButton>
    </form>
  );
}
