"use client";

import { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { createRequestAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatUnitLabel } from "@/lib/property-types";

type Property = {
  id: string;
  name: string;
  propertyType: {
    locationOptions: string[] | null;
    hasFloors: boolean;
    unitPrefix: string | null;
  };
  units: { id: string; label: string; tenant: { email: string } | null }[];
};

type Worker = {
  id: string;
  email: string;
  workerCategory: "in_house" | "third_party" | null;
  companyName: string | null;
};

export function AdminCreateRequestForm({
  properties,
  workers,
}: {
  properties: Property[];
  workers: Worker[];
}) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [isCommonArea, setIsCommonArea] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const property = useMemo(
    () => properties.find((p) => p.id === propertyId),
    [properties, propertyId],
  );

  const allowCommonArea = (property?.units.length ?? 0) > 1;
  const locationOptions =
    property?.propertyType.locationOptions &&
    property.propertyType.locationOptions.length > 0
      ? property.propertyType.locationOptions
      : ["Other"];

  const inHouseWorkers = workers.filter(
    (worker) => worker.workerCategory !== "third_party",
  );
  const thirdPartyWorkers = workers.filter(
    (worker) => worker.workerCategory === "third_party",
  );

  const handlePropertyChange = (nextId: string) => {
    setPropertyId(nextId);
    setIsCommonArea(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);

    try {
      await createRequestAction(formData);
    } catch (err) {
      if (
        err !== null &&
        typeof err === "object" &&
        "digest" in err &&
        typeof (err as { digest: unknown }).digest === "string" &&
        (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        throw err;
      }

      setError("Could not create the request. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (properties.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No properties available. Add a property first.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="propertyId">Property</Label>
            <Select
              id="propertyId"
              name="propertyId"
              value={propertyId}
              onChange={(event) => handlePropertyChange(event.target.value)}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          {allowCommonArea && (
            <div className="space-y-1.5">
              <Label>What is this about?</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsCommonArea(false)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    !isCommonArea
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input text-muted-foreground hover:bg-muted"
                  }`}
                >
                  A specific unit
                </button>
                <button
                  type="button"
                  onClick={() => setIsCommonArea(true)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    isCommonArea
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input text-muted-foreground hover:bg-muted"
                  }`}
                >
                  A common area
                </button>
              </div>
              <input
                type="hidden"
                name="isCommonArea"
                value={isCommonArea ? "true" : "false"}
              />
            </div>
          )}

          {!isCommonArea && (
            <div className="space-y-1.5">
              <Label htmlFor="unitId">Unit</Label>
              <Select id="unitId" name="unitId" defaultValue="" required>
                <option value="" disabled>
                  Select a unit
                </option>
                {property?.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {formatUnitLabel(property.propertyType, unit.label)}
                    {unit.tenant ? ` — ${unit.tenant.email}` : " — vacant"}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              {isCommonArea ? (
                <>
                  <Label htmlFor="location">Which common area?</Label>
                  <Input
                    id="location"
                    name="location"
                    placeholder="e.g. Lobby, Parking, Garden, Elevator"
                    required
                  />
                </>
              ) : (
                <>
                  <Label htmlFor="location">Room</Label>
                  <Select id="location" name="location" defaultValue={locationOptions[0]}>
                    {locationOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <Select id="priority" name="priority" defaultValue="medium">
                <option value="low">Low — can wait</option>
                <option value="medium">Medium — needs attention soon</option>
                <option value="high">High — urgent</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">What is the problem?</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Lobby light isn't working"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Describe it</Label>
            <Textarea
              id="description"
              name="description"
              rows={4}
              placeholder="Details for whoever gets assigned."
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="workerId">Assign a worker (optional)</Label>
            <Select id="workerId" name="workerId" defaultValue="">
              <option value="">Leave unassigned for now</option>
              {inHouseWorkers.length > 0 && (
                <optgroup label="In-house">
                  {inHouseWorkers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.email}
                    </option>
                  ))}
                </optgroup>
              )}
              {thirdPartyWorkers.length > 0 && (
                <optgroup label="3rd-party">
                  {thirdPartyWorkers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.email}
                      {worker.companyName ? ` (${worker.companyName})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && (
              <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            )}
            {isSubmitting ? "Creating..." : "Create request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
