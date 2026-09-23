"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dateInputValue, formatMoney, monthInputValue } from "@/lib/finance";

export type ServicesInvoiceUnitOption = {
  unitId: string;
  unitLabel: string;
  ownerName: string;
  tenantName: string | null;
};

type DraftLine = {
  qty: number;
  item: string;
  description: string;
  unitPrice: number;
};

export function ServicesInvoiceModal({
  propertyId,
  units,
  trigger,
}: {
  propertyId: string;
  units: ServicesInvoiceUnitOption[];
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(units[0]?.unitId ?? "");
  const [from, setFrom] = useState(`${monthInputValue()}-01`);
  const [to, setTo] = useState(dateInputValue());
  const [draft, setDraft] = useState<{
    billedName: string;
    lines: DraftLine[];
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unitId || !from || !to || from > to) return;
    const params = new URLSearchParams({ unit: unitId, from, to });
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/properties/${propertyId}/services-invoices?${params}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load invoice preview.");
        return response.json();
      })
      .then((data) => {
        setDraft({
          billedName: data.billedName,
          lines: data.lines,
          total: data.total,
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Could not load preview.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [propertyId, unitId, from, to]);

  const canGenerate = Boolean(
    unitId && from && to && from <= to && !generating && draft && draft.lines.length > 0,
  );

  return (
    <Modal
      title="Generate services invoice"
      description="Preview the lines, then issue a numbered Rawazen Services PDF. It stays Unpaid until you mark it paid on the invoice list."
      widthClassName="max-w-xl"
      trigger={
        trigger ?? (
          <Button type="button">
            <FileText className="h-4 w-4" />
            Generate invoice
          </Button>
        )
      }
    >
      {units.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Add a unit first, then generate a services invoice.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="services-invoice-unit" className="text-xs">
              Unit
            </Label>
            <Select
              id="services-invoice-unit"
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
            >
              {units.map((unit) => (
                <option key={unit.unitId} value={unit.unitId}>
                  {unit.unitLabel}
                  {unit.tenantName ? ` · ${unit.tenantName}` : ""}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="services-invoice-from" className="text-xs">
                From
              </Label>
              <Input
                id="services-invoice-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="services-invoice-to" className="text-xs">
                To
              </Label>
              <Input
                id="services-invoice-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading lines…</p>
          ) : error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : draft ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Bill to {draft.billedName}
              </p>
              {draft.lines.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  No maintenance, expenses, or rent received in this period.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {draft.lines.map((line, index) => (
                        <tr key={`${line.item}-${index}`}>
                          <td className="px-3 py-2 align-top font-medium">{line.item}</td>
                          <td className="px-3 py-2 align-top text-muted-foreground">
                            {line.description}
                          </td>
                          <td className="px-3 py-2 text-right align-top tabular-nums">
                            {formatMoney(line.unitPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-right text-sm font-semibold tabular-nums">
                Total {formatMoney(draft.total)}
              </p>
            </div>
          ) : null}

          <Button
            type="button"
            className="w-full"
            disabled={!canGenerate}
            onClick={async () => {
              setGenerating(true);
              setError(null);
              try {
                const response = await fetch(
                  `/api/properties/${propertyId}/services-invoices`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ unitId, from, to }),
                  },
                );
                if (!response.ok) {
                  const payload = (await response.json().catch(() => null)) as
                    | { error?: string }
                    | null;
                  throw new Error(payload?.error ?? "Could not generate invoice.");
                }
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download =
                  response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
                  "Rawazen-Services-Invoice.pdf";
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.open(url, "_blank");
                router.push(`/protected/properties/${propertyId}/services-invoices`);
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not generate invoice.");
              } finally {
                setGenerating(false);
              }
            }}
          >
            {generating ? "Generating…" : "Generate invoice"}
          </Button>
        </div>
      )}
    </Modal>
  );
}
