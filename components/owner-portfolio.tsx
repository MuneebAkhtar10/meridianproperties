import Link from "next/link";
import { Building2, ChevronDown, DoorOpen, ExternalLink, Plus } from "lucide-react";

import {
  EntityDocumentManager,
  type DocumentItem,
} from "@/components/entity-document-manager";
import { AccountSection } from "@/components/account-section";
import { CreatePropertyForm, type CreatePropertyTypeOption } from "@/components/create-property-form";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
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
                className="group overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
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

                <div className="space-y-5 border-t bg-muted/20 p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Property documents
                        <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/70">
                          OA agreement, NOC, Ministry of Housing, fire certificate…
                        </span>
                      </h4>
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

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Units ({property.units.length})
                    </h4>
                    <div className="space-y-2">
                      {property.units.map((unit) => (
                        <details
                          key={unit.id}
                          open={unit.documents.length > 0 && property.units.length <= 3}
                          className="group/unit overflow-hidden rounded-lg border border-border/60 bg-background"
                        >
                          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
                            <DoorOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="flex-1 font-medium">
                              {formatUnitLabel(
                                { unitPrefix: property.unitLabelPrefix, hasFloors: false },
                                unit.label,
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {unit.documents.length}{" "}
                              {unit.documents.length === 1 ? "document" : "documents"}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open/unit:rotate-180" />
                          </summary>
                          <div className="space-y-2 border-t bg-muted/10 p-3">
                            <p className="text-[11px] text-muted-foreground">
                              SPA, Mulkiya, Crooky, ownership contract and unit-level agreements.
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
