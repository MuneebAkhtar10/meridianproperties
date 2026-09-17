/** Best-effort latitude/longitude extraction from whatever a user pastes
 * into the "Location / map position" field — a full Google Maps URL, a
 * bare "lat,lng" pair, or (in the future) anything else that happens to
 * carry coordinates in one of these common shapes. Short/app.goo.gl links
 * redirect server-side and never expose coordinates in the URL itself, so
 * those are left alone rather than guessed at.
 */
export function parseLatLngFromMapsInput(
  value: string,
): { lat: number; lng: number } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const patterns = [
    // .../@23.5880,58.3829,15z/...
    /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    // ?q=23.5880,58.3829 or &q=23.5880,58.3829
    /[?&]q=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    // .../data=...!3d23.5880!4d58.3829... (Google's embedded place coordinates)
    /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
    // a bare "23.5880, 58.3829" pair pasted directly
    /^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      return { lat, lng };
    }
  }

  return null;
}
