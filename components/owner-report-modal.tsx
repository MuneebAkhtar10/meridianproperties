"use client";

import { FileBarChart } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dateInputValue, monthInputValue } from "@/lib/finance";

/**
 * Picks an owner and a date range, then navigates straight to that owner's
 * portfolio report — a plain GET form (no server action needed) so
 * submitting it is just a normal navigation to
 * /protected/properties/owner-report?owner=...&from=...&to=..., exactly
 * like following a link with query params.
 */
export function OwnerReportModal({
  owners,
}: {
  owners: { id: string; email: string; firstName: string | null; lastName: string | null }[];
}) {
  return (
    <Modal
      title="Owner Report"
      description="Pick an owner and a date range to see their whole portfolio — every property and unit they own, rent collected, expenses, and the resulting balance."
      trigger={
        <Button type="button" variant="outline">
          <FileBarChart className="h-4 w-4" />
          Owner Report
        </Button>
      }
    >
      <form
        method="GET"
        action="/protected/properties/owner-report"
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="owner-report-owner" className="text-xs">
            Owner
          </Label>
          <Select id="owner-report-owner" name="owner" required defaultValue="">
            <option value="" disabled>
              Select an owner…
            </option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {[owner.firstName, owner.lastName].filter(Boolean).join(" ") ||
                  owner.email}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="owner-report-from" className="text-xs">
              From
            </Label>
            <Input
              id="owner-report-from"
              type="date"
              name="from"
              required
              defaultValue={`${monthInputValue()}-01`}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="owner-report-to" className="text-xs">
              To
            </Label>
            <Input
              id="owner-report-to"
              type="date"
              name="to"
              required
              defaultValue={dateInputValue()}
            />
          </div>
        </div>

        <Button type="submit" className="w-full">
          <FileBarChart className="h-4 w-4" />
          View Report
        </Button>
      </form>
    </Modal>
  );
}
