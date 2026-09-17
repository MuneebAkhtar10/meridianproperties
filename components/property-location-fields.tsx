"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseLatLngFromMapsInput } from "@/lib/google-maps";
import { cn } from "@/lib/utils";

/** The "Location / map position" input plus its Latitude/Longitude
 * companions, wired together so pasting a Google Maps link fills the two
 * number fields in automatically when it can find coordinates in it —
 * still freely editable by hand afterward either way. */
export function PropertyLocationFields({
  idPrefix = "",
  defaultLocationMapPosition = "",
  defaultLatitude = "",
  defaultLongitude = "",
  compact = false,
}: {
  idPrefix?: string;
  defaultLocationMapPosition?: string;
  defaultLatitude?: string;
  defaultLongitude?: string;
  /** Matches the tighter label/spacing used on the property edit form. */
  compact?: boolean;
}) {
  const [latitude, setLatitude] = useState(defaultLatitude);
  const [longitude, setLongitude] = useState(defaultLongitude);
  const labelClassName = compact ? "text-xs" : undefined;
  const fieldSpacing = compact ? "space-y-1" : "space-y-1.5";

  function handleLocationChange(value: string) {
    const parsed = parseLatLngFromMapsInput(value);
    if (parsed) {
      setLatitude(String(parsed.lat));
      setLongitude(String(parsed.lng));
    }
  }

  return (
    <>
      <div className={fieldSpacing}>
        <Label htmlFor={`${idPrefix}locationMapPosition`} className={labelClassName}>
          Location / map position
        </Label>
        <Input
          id={`${idPrefix}locationMapPosition`}
          name="locationMapPosition"
          defaultValue={defaultLocationMapPosition}
          placeholder="Google Maps link or plus code — optional"
          onChange={(event) => handleLocationChange(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Paste a Google Maps link — latitude and longitude fill in below
          automatically when it has coordinates in it.
        </p>
      </div>

      <div className={cn("grid grid-cols-1 sm:grid-cols-2", compact ? "gap-2" : "gap-3")}>
        <div className={fieldSpacing}>
          <Label htmlFor={`${idPrefix}latitude`} className={labelClassName}>
            Latitude
          </Label>
          <Input
            id={`${idPrefix}latitude`}
            name="latitude"
            type="number"
            step="0.0000001"
            min={-90}
            max={90}
            placeholder="23.5880"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
          />
        </div>
        <div className={fieldSpacing}>
          <Label htmlFor={`${idPrefix}longitude`} className={labelClassName}>
            Longitude
          </Label>
          <Input
            id={`${idPrefix}longitude`}
            name="longitude"
            type="number"
            step="0.0000001"
            min={-180}
            max={180}
            placeholder="58.3829"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
          />
        </div>
      </div>
    </>
  );
}
