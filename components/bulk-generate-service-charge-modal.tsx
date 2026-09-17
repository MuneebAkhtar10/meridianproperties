"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";

import {
  bulkGenerateServiceChargeInvoicesAction,
  previewBulkServiceChargeInvoicesAction,
  type BulkServiceChargePreviewRow,
} from "@/app/service-charge-invoice-actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CloseModalOnSubmit, Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { dateInputValue, formatMoney } from "@/lib/finance";
import { cn } from "@/lib/utils";

/**
 * Bill a whole year's service charge across many units at once. A
 * two-step flow inside one modal: pick the scope (year/fund/property/
 * owner), preview exactly what each unit would be charged — every unit
 * can carry its own amount, editable per row — then confirm. Nothing is
 * created until the second step's "Generate" is actually pressed.
 */
export function BulkGenerateServiceChargeModal({
  properties,
  owners,
  funds,
}: {
  properties: { id: string; name: string }[];
  owners: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  }[];
  funds: { id: string; label: string }[];
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [propertyId, setPropertyId] = useState("all");
  const [ownerId, setOwnerId] = useState("all");
  const [dueDate, setDueDate] = useState(
    dateInputValue(new Date(Date.UTC(currentYear, 0, 10))),
  );
  const [graceDays, setGraceDays] = useState("0");

  const [rows, setRows] = useState<BulkServiceChargePreviewRow[] | null>(null);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    setLoading(true);
    setError(null);
    try {
      const result = await previewBulkServiceChargeInvoicesAction({
        year,
        fundId,
        propertyId,
        ownerId,
      });
      const nextIncluded: Record<string, boolean> = {};
      const nextAmounts: Record<string, string> = {};
      result.forEach((row) => {
        nextIncluded[row.unitId] = !row.alreadyInvoiced;
        nextAmounts[row.unitId] = row.amount;
      });
      setRows(result);
      setIncluded(nextIncluded);
      setAmounts(nextAmounts);
    } catch {
      setError("Couldn't load a preview. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setRows(null);
    setIncluded({});
    setAmounts({});
    setError(null);
  }

  const includedRows = (rows ?? []).filter((row) => included[row.unitId]);
  const total = includedRows.reduce(
    (sum, row) => sum + Number(amounts[row.unitId] ?? row.amount),
    0,
  );
  const rowsJson = JSON.stringify(
    includedRows.map((row) => ({
      unitId: row.unitId,
      amount: amounts[row.unitId] ?? row.amount,
    })),
  );

  return (
    <Modal
      title="Generate Service Charge"
      description="Bill a whole year's service charge across many units at once — review every unit's amount before anything is created."
      widthClassName="max-w-3xl"
      trigger={
        <Button type="button" variant="outline">
          <Calculator className="h-4 w-4" />
          Generate Service Charge
        </Button>
      }
    >
      {!rows ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Year</Label>
              <Input
                type="number"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Property</Label>
              <Select
                value={propertyId}
                onChange={(event) => setPropertyId(event.target.value)}
              >
                <option value="all">All properties</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Owner</Label>
              <Select
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
              >
                <option value="all">All owners</option>
                {owners.map((owner) => {
                  const name = [owner.firstName, owner.lastName]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <option key={owner.id} value={owner.id}>
                      {name ? `${name} (${owner.email})` : owner.email}
                    </option>
                  );
                })}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Due date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Grace (days)</Label>
              <Input
                type="number"
                min="0"
                value={graceDays}
                onChange={(event) => setGraceDays(event.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <Button
            type="button"
            className="w-full"
            onClick={handlePreview}
            disabled={loading || !fundId}
          >
            {loading ? "Loading..." : "Preview"}
          </Button>
        </div>
      ) : (
        <form
          action={bulkGenerateServiceChargeInvoicesAction}
          className="space-y-3"
        >
          <input type="hidden" name="fundId" value={fundId} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="dueDate" value={dueDate} />
          <input type="hidden" name="graceDays" value={graceDays} />
          <input type="hidden" name="rows" value={rowsJson} />
          <CloseModalOnSubmit />

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {includedRows.length} of {rows.length} unit
              {rows.length === 1 ? "" : "s"} selected · Total{" "}
              {formatMoney(total)}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Back
            </Button>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No units with a service charge amount configured match these
              filters.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60 text-left uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2 py-2"></th>
                    <th className="px-2 py-2">Property</th>
                    <th className="px-2 py-2">Unit</th>
                    <th className="px-2 py-2">Owner</th>
                    <th className="px-2 py-2 text-right">Amount (OMR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr
                      key={row.unitId}
                      className={cn(!included[row.unitId] && "opacity-50")}
                    >
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={!!included[row.unitId]}
                          onChange={(event) =>
                            setIncluded((prev) => ({
                              ...prev,
                              [row.unitId]: event.target.checked,
                            }))
                          }
                          className="h-3.5 w-3.5 rounded border-input"
                        />
                      </td>
                      <td className="px-2 py-1.5">{row.propertyName}</td>
                      <td className="px-2 py-1.5">
                        {row.unitLabel}
                        {row.alreadyInvoiced && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            Already invoiced
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{row.ownerLabel}</td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={amounts[row.unitId] ?? row.amount}
                          onChange={(event) =>
                            setAmounts((prev) => ({
                              ...prev,
                              [row.unitId]: event.target.value,
                            }))
                          }
                          className="h-7 w-24 text-right text-xs"
                          disabled={!included[row.unitId]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <SubmitButton
            className="w-full"
            pendingText="Generating..."
            disabled={includedRows.length === 0}
          >
            Generate {includedRows.length} invoice
            {includedRows.length === 1 ? "" : "s"}
          </SubmitButton>
        </form>
      )}
    </Modal>
  );
}
