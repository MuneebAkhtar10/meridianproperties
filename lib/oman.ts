export const OMAN_GOVERNORATES = [
  "Muscat",
  "Dhofar",
  "Musandam",
  "Al Buraimi",
  "Ad Dakhiliyah",
  "North Al Batinah",
  "South Al Batinah",
  "North Ash Sharqiyah",
  "South Ash Sharqiyah",
  "Ad Dhahirah",
  "Al Wusta",
] as const;

export type OmanAddress = {
  address: string;
  governorate?: string | null;
  wilayat?: string | null;
  area?: string | null;
  wayNumber?: string | null;
  buildingNumber?: string | null;
  postalCode?: string | null;
};

/** A compact Oman-style address for cards, requests and tenant dashboards. */
export function formatOmanAddress(property: OmanAddress): string {
  const locality = [property.area, property.wilayat, property.governorate]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(", ");
  const numbered = [
    property.buildingNumber ? `Building ${property.buildingNumber}` : null,
    property.wayNumber ? `Way ${property.wayNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    property.address,
    numbered || null,
    locality || null,
    property.postalCode ? `PC ${property.postalCode}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Letterhead lines matching the owners-association service-charge invoice:
 * "Qurum, Badr Al Qurum Bldg # 1009, Way # 1814"
 * "Muscat, Sultanate of Oman" */
export function formatServiceChargeLetterheadAddress(
  property: OmanAddress & { buildingName?: string | null },
): string[] {
  const place = [property.area, property.buildingName]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(", ");
  const numbers = [
    property.buildingNumber?.trim()
      ? `Bldg # ${property.buildingNumber.trim()}`
      : null,
    property.wayNumber?.trim() ? `Way # ${property.wayNumber.trim()}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const line1 = [place, numbers].filter(Boolean).join(" ");
  const line2 = `${property.governorate?.trim() || "Muscat"}, Sultanate of Oman`;
  return [line1, line2].filter(Boolean);
}
