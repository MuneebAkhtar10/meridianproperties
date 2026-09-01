import { EntityDocumentCategory } from "@/lib/generated/prisma/client";

export const ENTITY_DOCUMENT_CATEGORY_LABEL: Record<
  EntityDocumentCategory,
  string
> = {
  tenancy_agreement: "Signed tenancy agreement",
  municipality_registration: "Municipality registration",
  move_in_report: "Move-in / handover report",
  title_deed: "Title deed",
  ownership_certificate: "Ownership certificate",
  cadastral_plan: "Cadastral plan / Krooki",
  building_permit: "Building permit / approval",
  completion_certificate: "Building completion certificate",
  noc: "No-objection certificate (NOC)",
  property_insurance: "Property insurance",
  civil_id: "Civil ID",
  passport: "Passport",
  resident_card: "Resident card",
  visa: "Visa",
  employment_letter: "Employment / sponsor letter",
  other: "Other document",
};

export const TENANCY_DOCUMENT_CATEGORIES = [
  EntityDocumentCategory.tenancy_agreement,
  EntityDocumentCategory.municipality_registration,
  EntityDocumentCategory.move_in_report,
  EntityDocumentCategory.other,
] as const;

export const PROPERTY_DOCUMENT_CATEGORIES = [
  EntityDocumentCategory.title_deed,
  EntityDocumentCategory.ownership_certificate,
  EntityDocumentCategory.cadastral_plan,
  EntityDocumentCategory.building_permit,
  EntityDocumentCategory.completion_certificate,
  EntityDocumentCategory.noc,
  EntityDocumentCategory.property_insurance,
  EntityDocumentCategory.other,
] as const;

export const PERSONAL_DOCUMENT_CATEGORIES = [
  EntityDocumentCategory.civil_id,
  EntityDocumentCategory.passport,
  EntityDocumentCategory.resident_card,
  EntityDocumentCategory.visa,
  EntityDocumentCategory.employment_letter,
  EntityDocumentCategory.other,
] as const;

export type EntityDocumentTargetType = "property" | "tenancy" | "user";

export function categoriesForTarget(
  targetType: EntityDocumentTargetType,
): readonly EntityDocumentCategory[] {
  if (targetType === "property") return PROPERTY_DOCUMENT_CATEGORIES;
  if (targetType === "tenancy") return TENANCY_DOCUMENT_CATEGORIES;
  return PERSONAL_DOCUMENT_CATEGORIES;
}
