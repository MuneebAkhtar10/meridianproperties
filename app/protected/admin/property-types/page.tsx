import { Building2, Plus } from "lucide-react";

import {
  createPropertyTypeAction,
  deletePropertyTypeAction,
  updatePropertyTypeAction,
} from "@/app/admin-actions";
import { EmptyState } from "@/components/empty-state";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export default async function PropertyTypesPage({ searchParams }: PageProps) {
  const message = (await searchParams) as unknown as Message;
  await requireRole(UserType.admin);

  const propertyTypes = await prisma.propertyType.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { properties: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8">
      <PageHeader
        title="Property types"
        description="Villa, apartment building, office — add whatever kinds of property you manage. Each type controls its own wording and whether its units are organized by floor."
        back={{ href: "/protected/properties", label: "Properties" }}
      />

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-4">
          {propertyTypes.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No property types yet"
              description="Add your first property type using the form."
            />
          ) : (
            propertyTypes.map((propertyType) => (
              <Card key={propertyType.id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold">{propertyType.label}</h3>
                      <p className="text-sm text-muted-foreground">
                        {propertyType._count.properties} propert
                        {propertyType._count.properties === 1 ? "y" : "ies"}{" "}
                        using this type
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 sm:shrink-0 sm:flex-col sm:items-end">
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {propertyType.hasFloors
                          ? "Organized by floor"
                          : "No floors"}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {propertyType.hasBedrooms
                          ? "Tracks bedrooms"
                          : "No bedrooms"}
                      </span>
                    </div>
                  </div>

                  <form className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="hidden"
                      name="propertyTypeId"
                      value={propertyType.id}
                    />
                    <div className="space-y-1.5">
                      <Label htmlFor={`label-${propertyType.id}`}>
                        Label
                      </Label>
                      <Input
                        id={`label-${propertyType.id}`}
                        name="label"
                        defaultValue={propertyType.label}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`prefix-${propertyType.id}`}>
                        Unit prefix (optional)
                      </Label>
                      <Input
                        id={`prefix-${propertyType.id}`}
                        name="unitPrefix"
                        placeholder="Apt"
                        defaultValue={propertyType.unitPrefix ?? ""}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`singular-${propertyType.id}`}>
                        Unit noun (singular)
                      </Label>
                      <Input
                        id={`singular-${propertyType.id}`}
                        name="unitNounSingular"
                        defaultValue={propertyType.unitNounSingular}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`plural-${propertyType.id}`}>
                        Unit noun (plural)
                      </Label>
                      <Input
                        id={`plural-${propertyType.id}`}
                        name="unitNounPlural"
                        defaultValue={propertyType.unitNounPlural}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        name="hasFloors"
                        defaultChecked={propertyType.hasFloors}
                        className="h-4 w-4 rounded border-input"
                      />
                      Units are organized by floor
                    </label>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        name="hasBedrooms"
                        defaultChecked={propertyType.hasBedrooms}
                        className="h-4 w-4 rounded border-input"
                      />
                      Units have a bedroom count
                    </label>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`locations-${propertyType.id}`}>
                        Where issues happen (one per line)
                      </Label>
                      <Textarea
                        id={`locations-${propertyType.id}`}
                        name="locationOptions"
                        rows={5}
                        className="text-xs"
                        defaultValue={(propertyType.locationOptions ?? [])
                          .filter((option) => option.toLowerCase() !== "other")
                          .join("\n")}
                      />
                      <p className="text-xs text-muted-foreground">
                        Shown in "Where is the problem?" when a tenant of
                        this type reports an issue. "Other" is added
                        automatically.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <SubmitButton
                        formAction={updatePropertyTypeAction}
                        variant="outline"
                        size="sm"
                        pendingText="Saving..."
                      >
                        Save changes
                      </SubmitButton>
                      <SubmitButton
                        formAction={deletePropertyTypeAction}
                        variant="ghost"
                        size="sm"
                        pendingText="Deleting..."
                        className="ml-auto text-muted-foreground hover:text-destructive"
                        disabled={propertyType._count.properties > 0}
                      >
                        Delete
                      </SubmitButton>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              Add a property type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-label">Label</Label>
                <Input
                  id="new-label"
                  name="label"
                  placeholder="Office building"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-prefix">Unit prefix (optional)</Label>
                <Input
                  id="new-prefix"
                  name="unitPrefix"
                  placeholder="Ste"
                />
                <p className="text-xs text-muted-foreground">
                  Shown before a unit's number, e.g. "Ste 101". Leave blank if
                  units should just show their own label, like "Villa 2".
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-singular">Unit noun (singular)</Label>
                  <Input
                    id="new-singular"
                    name="unitNounSingular"
                    placeholder="Office"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-plural">Unit noun (plural)</Label>
                  <Input
                    id="new-plural"
                    name="unitNounPlural"
                    placeholder="Offices"
                    required
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="hasFloors"
                  defaultChecked
                  className="h-4 w-4 rounded border-input"
                />
                Units are organized by floor
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="hasBedrooms"
                  defaultChecked
                  className="h-4 w-4 rounded border-input"
                />
                Units have a bedroom count
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="new-locations">
                  Where issues happen (one per line)
                </Label>
                <Textarea
                  id="new-locations"
                  name="locationOptions"
                  rows={5}
                  placeholder={
                    "Reception\nMeeting room\nRestroom\nWhole office"
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Shown in "Where is the problem?" when a tenant of this type
                  reports an issue. "Other" is added automatically.
                </p>
              </div>
              <SubmitButton
                formAction={createPropertyTypeAction}
                className="w-full"
                pendingText="Adding..."
              >
                Add property type
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
