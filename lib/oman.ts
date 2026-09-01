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
