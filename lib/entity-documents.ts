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
  ownership_contract: "Ownership contract",
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
  driving_license: "Driving license",
  vehicle_registration: "Vehicle registration (Mulkiya)",
  car_insurance: "Car insurance",
  parking_agreement: "Parking slot agreement",
  other: "Other document",
};

export const TENANCY_DOCUMENT_CATEGORIES = [
  EntityDocumentCategory.tenancy_agreement,
  EntityDocumentCategory.municipality_registration,
  EntityDocumentCategory.move_in_report,
  EntityDocumentCategory.parking_agreement,
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
  EntityDocumentCategory.driving_license,
  EntityDocumentCategory.vehicle_registration,
  EntityDocumentCategory.car_insurance,
  EntityDocumentCategory.other,
] as const;

/// The contract establishing a unit's owner — set up alongside the unit
/// itself, distinct from a property's own title-deed-style paperwork.
export const UNIT_DOCUMENT_CATEGORIES = [
  EntityDocumentCategory.ownership_contract,
  EntityDocumentCategory.ownership_certificate,
  EntityDocumentCategory.other,
] as const;

export type EntityDocumentTargetType = "property" | "unit" | "tenancy" | "user";

export function categoriesForTarget(
  targetType: EntityDocumentTargetType,
): readonly EntityDocumentCategory[] {
  if (targetType === "property") return PROPERTY_DOCUMENT_CATEGORIES;
  if (targetType === "unit") return UNIT_DOCUMENT_CATEGORIES;
  if (targetType === "tenancy") return TENANCY_DOCUMENT_CATEGORIES;
  return PERSONAL_DOCUMENT_CATEGORIES;
}
