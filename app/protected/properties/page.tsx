import { Building2, DoorOpen, MapPin, Plus, Settings, Users } from "lucide-react";
import Link from "next/link";

import { createPropertyAction } from "@/app/admin-actions";
import { EmptyState } from "@/components/empty-state";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  UploadBudgetProvider,
  UploadFileInput,
} from "@/components/upload-file-input";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatOmanAddress, OMAN_GOVERNORATES } from "@/lib/oman";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export default async function PropertiesPage({ searchParams }: PageProps) {
  const message = (await searchParams) as unknown as Message;
  await requireRole(UserType.admin);

  const [properties, propertyTypes] = await Promise.all([
    prisma.property.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        propertyType: true,
        _count: { select: { units: true } },
        units: { select: { tenantId: true } },
      },
    }),
    prisma.propertyType.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const totalUnits = properties.reduce((sum, p) => sum + p._count.units, 0);
  const totalOccupied = properties.reduce(
    (sum, p) => sum + p.units.filter((u) => u.tenantId).length,
    0,
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <PageHeader
        title="Properties"
        description={`${properties.length} propert${
          properties.length === 1 ? "y" : "ies"
        } · ${totalOccupied} of ${totalUnits} units occupied`}
      >
        <ButtonLink href="/protected/admin/property-types" variant="outline">
          <Settings className="h-4 w-4" />
          Property types
        </ButtonLink>
      </PageHeader>

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_23rem]">
        <div className="space-y-4">
          {properties.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No properties yet"
              description="Add your first Oman property using the form, then add its units."
            />
          ) : (
            properties.map((property) => {
              const occupied = property.units.filter((u) => u.tenantId).length;
              const total = property._count.units;
              const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;

              return (
                <Link
                  key={property.id}
                  href={`/protected/properties/${property.id}`}
                  className="block"
                >
                  <Card className="transition-all hover:border-primary/40 hover:shadow-md">
                    <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                          <Building2 className="h-5 w-5" />
                        </span>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{property.name}</h3>
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {property.propertyType.label}
                            </span>
                          </div>
                          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />
                            {formatOmanAddress(property)}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-6">
                        <Stat
                          icon={<DoorOpen className="h-4 w-4" />}
                          value={total}
                          label={property.propertyType.unitNounPlural.toLowerCase()}
                        />
                        <Stat
                          icon={<Users className="h-4 w-4" />}
                          value={`${occupied}`}
                          label={`occupied · ${pct}%`}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              Add a property
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UploadBudgetProvider>
              <form className="space-y-4" encType="multipart/form-data">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Al Khuwair Heights"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="type">Property type</Label>
                  {propertyTypes.length === 0 ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      No property types yet.{" "}
                      <Link
                        href="/protected/admin/property-types"
                        className="font-medium underline"
                      >
                        Add one first
                      </Link>{" "}
                      before creating a property.
                    </p>
                  ) : (
                    <Select
                      id="type"
                      name="propertyTypeId"
                      defaultValue={propertyTypes[0]?.id}
                      required
                    >
                      {propertyTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.label}
                        </option>
                      ))}
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Whether floors apply and how units are labeled both come
                    from the type.{" "}
                    <Link
                      href="/protected/admin/property-types"
                      className="underline"
                    >
                      Manage property types
                    </Link>
                    .
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="address">Address / locality</Label>
                  <Input
                    id="address"
                    name="address"
                    placeholder="Al Khuwair 33"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="governorate">Governorate</Label>
                    <Select
                      id="governorate"
                      name="governorate"
                      defaultValue="Muscat"
                    >
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

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="wayNumber">Way no.</Label>
                    <Input id="wayNumber" name="wayNumber" placeholder="3521" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="buildingNumber">Building no.</Label>
                    <Input
                      id="buildingNumber"
                      name="buildingNumber"
                      placeholder="214"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="postalCode">Postal code</Label>
                    <Input
                      id="postalCode"
                      name="postalCode"
                      placeholder="133"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="titleDeedDocuments">
                    Title deed / ownership documents
                  </Label>
                  <UploadFileInput
                    id="titleDeedDocuments"
                    name="titleDeedDocuments"
                    multiple
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="approvalDocuments">
                    Municipality / building approvals
                  </Label>
                  <UploadFileInput
                    id="approvalDocuments"
                    name="approvalDocuments"
                    multiple
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="otherPropertyDocuments">
                    Other property documents
                  </Label>
                  <UploadFileInput
                    id="otherPropertyDocuments"
                    name="otherPropertyDocuments"
                    multiple
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes</Label>
                  <Input id="notes" name="notes" placeholder="Optional" />
                </div>

                <SubmitButton
                  formAction={createPropertyAction}
                  className="w-full"
                  pendingText="Creating..."
                >
                  Create property
                </SubmitButton>
              </form>
            </UploadBudgetProvider>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1.5 font-semibold">
        <span className="text-muted-foreground">{icon}</span>
        {value}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
