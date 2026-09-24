import { EntityDocumentCategory } from "@/lib/generated/prisma/client";

export const ENTITY_DOCUMENT_CATEGORY_LABEL: Record<
  EntityDocumentCategory,
  string
> = {
  tenancy_agreement: "Rent / tenancy agreement",
  municipality_registration: "Municipality registration",
  move_in_report: "Move-in / handover report",
  title_deed: "Title deed",
  ownership_certificate: "Mulkiya (ownership)",
  ownership_contract: "Ownership contract",
  cadastral_plan: "Krooky (blueprint)",
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
  fire_certificate: "Fire certificate",
  pest_control_agreement: "Pest control agreement",
  refuse_collection_agreement: "Refuse collection agreement",
  oa_agreement: "OA agreement (2-year)",
  ministry_housing_agreement: "Ministry of Housing agreement",
  sales_purchase_agreement: "Sales & Purchase Agreement (SPA)",
  other: "Other document",
};

export const TENANCY_DOCUMENT_CATEGORIES = [
  EntityDocumentCategory.tenancy_agreement,
  EntityDocumentCategory.municipality_registration,
  EntityDocumentCategory.move_in_report,
  EntityDocumentCategory.parking_agreement,
  EntityDocumentCategory.pest_control_agreement,
  EntityDocumentCategory.refuse_collection_agreement,
  EntityDocumentCategory.noc,
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
  EntityDocumentCategory.parking_agreement,
  EntityDocumentCategory.tenancy_agreement,
  EntityDocumentCategory.fire_certificate,
  EntityDocumentCategory.pest_control_agreement,
  EntityDocumentCategory.refuse_collection_agreement,
  EntityDocumentCategory.oa_agreement,
  EntityDocumentCategory.ministry_housing_agreement,
  EntityDocumentCategory.sales_purchase_agreement,
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
  EntityDocumentCategory.cadastral_plan,
  EntityDocumentCategory.oa_agreement,
  EntityDocumentCategory.ministry_housing_agreement,
  EntityDocumentCategory.sales_purchase_agreement,
  EntityDocumentCategory.parking_agreement,
  EntityDocumentCategory.tenancy_agreement,
  EntityDocumentCategory.noc,
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
