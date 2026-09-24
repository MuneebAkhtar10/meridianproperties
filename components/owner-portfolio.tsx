import Link from "next/link";
import { Building2, ChevronDown, DoorOpen, ExternalLink, Plus } from "lucide-react";

import {
  EntityDocumentManager,
  type DocumentItem,
} from "@/components/entity-document-manager";
import { AccountSection } from "@/components/account-section";
import { CreatePropertyForm, type CreatePropertyTypeOption } from "@/components/create-property-form";
import { createUnitAction } from "@/app/admin-actions";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CloseModalOnSubmit, Modal } from "@/components/ui/modal";
import { formatUnitLabel } from "@/lib/property-types";

export type OwnerPortfolioProperty = {
  id: string;
  name: string;
  propertyDocuments: DocumentItem[];
  units: {
    id: string;
    label: string;
    documents: DocumentItem[];
  }[];
  unitLabelPrefix: string | null;
  /** "Unit", "BM", "Villa"... — the property type's own noun. */
  unitNoun: string;
  hasFloors: boolean;
  hasBedrooms: boolean;
  /** Independent properties have exactly one unit, so none can be added. */
  singleUnitOnly: boolean;
};

/**
 * Everything one owner holds, grouped by property — the owner-side view of
 * the exact same document rows the property page manages (a document is
 * stored once, against its property or unit; both sections just read and
 * write it), so uploading or deleting here shows up there and vice versa.
 */
export function OwnerPortfolio({
  ownerId,
  ownerName,
  propertyTypes,
  properties,
}: {
  ownerId: string;
  ownerName: string;
  propertyTypes: CreatePropertyTypeOption[];
  properties: OwnerPortfolioProperty[];
}) {
  const docCount = properties.reduce(
    (sum, p) =>
      sum + p.propertyDocuments.length + p.units.reduce((s, u) => s + u.documents.length, 0),
    0,
  );

  return (
    <AccountSection
      icon={<Building2 />}
      tone="indigo"
      title="Properties & documents"
      subtitle={`${properties.length} ${properties.length === 1 ? "property" : "properties"} · ${docCount} ${docCount === 1 ? "document" : "documents"}`}
      action={
        <Modal
          title="Add another property"
          description={`Create a property for ${ownerName} — it's linked to them straight away.`}
          widthClassName="max-w-2xl"
          trigger={
            <Button type="button" variant="outline" size="sm" className="bg-background">
              <Plus className="h-3.5 w-3.5" />
              Add another property
            </Button>
          }
        >
          <CreatePropertyForm
            propertyTypes={propertyTypes}
            isOwner={false}
            isAdmin
            defaultOwnerId={ownerId}
            defaultOwnerName={ownerName}
            stayOnPeople
          />
        </Modal>
      }
    >
      {properties.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-background p-4 text-center text-xs text-muted-foreground">
          No properties linked to this owner yet.
        </p>
      ) : (
        <div className="space-y-3">
          {properties.map((property) => {
            const unitDocs = property.units.reduce((sum, u) => sum + u.documents.length, 0);
            const total = property.propertyDocuments.length + unitDocs;
            return (
              <details
                key={property.id}
                className="group overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-md"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 bg-slate-50 px-4 py-3.5 transition-colors hover:bg-slate-100 group-open:border-b group-open:border-slate-300 [&::-webkit-details-marker]:hidden">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-base font-semibold">
                    {property.name}
                  </span>
                  <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {property.units.length} {property.units.length === 1 ? "unit" : "units"}
                    </span>
                    <span
                      className={
                        total > 0
                          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                          : "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                      }
                    >
                      {total} {total === 1 ? "document" : "documents"}
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>

                <div className="space-y-6 bg-slate-100/70 p-4 sm:p-5">
                  <div className="space-y-3 rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">
                          Property documents
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          OA agreement, NOC, Ministry of Housing, fire certificate…
                        </p>
                      </div>
                      <Link
                        href={`/protected/properties/${property.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Open property page
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                    <EntityDocumentManager
                      documents={property.propertyDocuments}
                      targetType="property"
                      targetId={property.id}
                      back="/protected/users"
                      bare
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <DoorOpen className="h-4 w-4 text-indigo-600" />
                      Units
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {property.units.length}
                      </span>
                    </h4>
                    {!property.singleUnitOnly && (
                      <Modal
                        title={`Add another ${property.unitNoun.toLowerCase()}`}
                        description={`Add a ${property.unitNoun.toLowerCase()} to ${property.name} — it's assigned to ${ownerName} straight away.`}
                        trigger={
                          <Button type="button" variant="outline" size="sm" className="bg-white">
                            <Plus className="h-3.5 w-3.5" />
                            Add {property.unitNoun.toLowerCase()}
                          </Button>
                        }
                      >
                        <form className="space-y-4">
                          <input type="hidden" name="propertyId" value={property.id} />
                          <input type="hidden" name="ownerId" value={ownerId} />
                          <input type="hidden" name="back" value="/protected/users?role=owner" />
                          {/* Rent/maintenance follow the property type's own
                           * defaults; the server clamps them to what the type
                           * supports. */}
                          <input type="hidden" name="rentBillsEnabled" value="on" />
                          <input type="hidden" name="maintenanceEnabled" value="on" />
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1.5">
                              <Label htmlFor={`add-unit-label-${property.id}`} className="text-xs">
                                {property.unitNoun} number
                              </Label>
                              <Input
                                id={`add-unit-label-${property.id}`}
                                name="label"
                                placeholder={property.hasFloors ? "101" : `${property.unitNoun} 1`}
                                required
                              />
                            </div>
                            {property.hasFloors && (
                              <div className="space-y-1.5">
                                <Label htmlFor={`add-unit-floor-${property.id}`} className="text-xs">
                                  Floor
                                </Label>
                                <Input
                                  id={`add-unit-floor-${property.id}`}
                                  name="floor"
                                  type="number"
                                  placeholder="1"
                                />
                              </div>
                            )}
                            {property.hasBedrooms && (
                              <div className="space-y-1.5">
                                <Label htmlFor={`add-unit-beds-${property.id}`} className="text-xs">
                                  Bedrooms
                                </Label>
                                <Input
                                  id={`add-unit-beds-${property.id}`}
                                  name="bedrooms"
                                  type="number"
                                  min={0}
                                  placeholder="2"
                                />
                              </div>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`add-unit-ent-${property.id}`} className="text-xs">
                              Unit entitlement (m²)
                            </Label>
                            <Input
                              id={`add-unit-ent-${property.id}`}
                              name="entitlements"
                              type="number"
                              min={0}
                              placeholder="e.g. 70"
                            />
                          </div>
                          <SubmitButton
                            formAction={createUnitAction}
                            className="w-full"
                            pendingText="Adding..."
                          >
                            Add {property.unitNoun.toLowerCase()}
                          </SubmitButton>
                          <CloseModalOnSubmit />
                        </form>
                      </Modal>
                    )}
                    </div>
                    <div className="space-y-3">
                      {property.units.map((unit) => (
                        <details
                          key={unit.id}
                          open={unit.documents.length > 0 && property.units.length <= 3}
                          className="group/unit overflow-hidden rounded-xl border border-slate-300 border-l-4 border-l-indigo-500 bg-white shadow-sm"
                        >
                          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-sm transition-colors hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                            <DoorOpen className="h-4 w-4 shrink-0 text-indigo-600" />
                            <span className="flex-1 text-sm font-semibold">
                              {formatUnitLabel(
                                { unitPrefix: property.unitLabelPrefix, hasFloors: false },
                                unit.label,
                              )}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                              {unit.documents.length}{" "}
                              {unit.documents.length === 1 ? "document" : "documents"}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open/unit:rotate-180" />
                          </summary>
                          <div className="space-y-3 border-t border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs text-muted-foreground">
                              SPA, Mulkiya, Krooky, ownership contract and unit-level agreements.
                            </p>
                            <EntityDocumentManager
                              documents={unit.documents}
                              targetType="unit"
                              targetId={unit.id}
                              back="/protected/users"
                              bare
                            />
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </AccountSection>
  );
}
