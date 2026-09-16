import {
  Briefcase,
  Building2,
  FileSignature,
  Phone,
  StickyNote,
  Tags,
} from "lucide-react";

import { createSupplierAction } from "@/app/supplier-actions";
import { FormMessage, Message } from "@/components/form-message";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SupplierPropertyPicker } from "@/components/supplier-property-picker";
import { getExpenseCategoriesWithSubcategories } from "@/lib/expenses";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";
import { PageProps } from "@/types/page";

export default async function NewSupplierPage({ searchParams }: PageProps) {
  const message = (await searchParams) as unknown as Message;
  await requireRole(UserType.admin);

  const [categories, properties] = await Promise.all([
    getExpenseCategoriesWithSubcategories(),
    prisma.property.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="w-full space-y-5 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="New supplier"
        back={{ href: "/protected/admin/suppliers", label: "Suppliers" }}
      />

      {"error" in message || "success" in message ? (
        <FormMessage message={message} />
      ) : null}

      <form className="mx-auto max-w-4xl space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <Building2 className="h-4.5 w-4.5" />
              </span>
              <div>
                <CardTitle className="text-base">Company</CardTitle>
                <CardDescription>Who this vendor is.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">Company name</Label>
                <Input id="companyName" name="companyName" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="companyNameAr">Company name (Arabic)</Label>
                <Input id="companyNameAr" name="companyNameAr" dir="rtl" />
              </div>
              <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="externalReference">External reference</Label>
                  <Input id="externalReference" name="externalReference" />
                </div>
                <label className="flex items-center gap-2 pb-2.5 text-sm whitespace-nowrap">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked
                    className="h-4 w-4 rounded border-input"
                  />
                  Active
                </label>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <Phone className="h-4.5 w-4.5" />
              </span>
              <div>
                <CardTitle className="text-base">Contact</CardTitle>
                <CardDescription>How to reach them.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="contactPerson">Contact person</Label>
                  <Input id="contactPerson" name="contactPerson" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" type="tel" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <Input id="whatsapp" name="whatsapp" type="tel" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Input id="address" name="address" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Tags className="h-4.5 w-4.5" />
            </span>
            <div>
              <CardTitle className="text-base">Services covered</CardTitle>
              <CardDescription>
                Suggests this supplier when logging an expense against one of
                these categories.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No expense categories yet — add one from the Expenses page's
                "Expense Types" tab first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <label key={category.id}>
                    <input
                      type="checkbox"
                      name="categoryIds"
                      value={category.id}
                      className="peer sr-only"
                    />
                    <span className="inline-flex cursor-pointer items-center rounded-full border border-input px-3 py-1.5 text-sm font-medium text-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground">
                      {category.label}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <Building2 className="h-4.5 w-4.5" />
            </span>
            <div>
              <CardTitle className="text-base">Properties</CardTitle>
              <CardDescription>
                Which properties this vendor can be assigned to when logging
                an expense.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <SupplierPropertyPicker properties={properties} defaultAllProperties />
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <FileSignature className="h-4.5 w-4.5" />
            </span>
            <div>
              <CardTitle className="text-base">Contract &amp; charges</CardTitle>
              <CardDescription>
                Optional — fill in if there's a standing arrangement.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="availableForEmergencies"
                className="h-4 w-4 rounded border-input"
              />
              Available for emergencies (24/7)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="calloutCharge">Call-out charge (OMR)</Label>
                <Input
                  id="calloutCharge"
                  name="calloutCharge"
                  type="number"
                  min="0"
                  step="0.001"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contractStart">Contract start</Label>
                <Input id="contractStart" name="contractStart" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contractEnd">Contract end</Label>
                <Input id="contractEnd" name="contractEnd" type="date" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contractInfo">Contract information</Label>
              <Textarea id="contractInfo" name="contractInfo" className="min-h-20" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <StickyNote className="h-4.5 w-4.5" />
            </span>
            <div>
              <CardTitle className="text-base">Other</CardTitle>
              <CardDescription>Anything else worth noting.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" className="min-h-20" />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2 pb-2">
          <SubmitButton
            formAction={createSupplierAction}
            pendingText="Creating..."
          >
            <Briefcase className="h-4 w-4" />
            Create supplier
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
