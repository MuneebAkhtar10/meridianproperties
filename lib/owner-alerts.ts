/**
 * Landlord-facing WhatsApp copy. Meta only delivers these as a single
 * {{1}} line inside the approved utility template (newlines are stripped
 * and dropped), so this is a labeled one-liner — not a chat letter.
 */
export function formatOwnerWhatsApp(input: {
  heading: string;
  intro: string;
  lines?: { label: string; value: string }[];
  closing?: string;
}): string {
  const details = (input.lines ?? [])
    .filter((line) => line.value.trim().length > 0)
    .map((line) => `${line.label}: ${plain(line.value)}`);

  return [plain(input.intro), ...details, input.closing ? plain(input.closing) : ""]
    .filter((part) => part.length > 0)
    .join(" | ");
}

function plain(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[—–−]/g, "-").replace(/\s+/g, " ").trim();
}

export function ownerChargeIssuedCopy(input: {
  kind: "rent" | "bill";
  propertyName: string;
  unitLabel: string;
  tenantName: string;
  amount: string;
  dueDate: string;
  title: string;
}): {
  title: string;
  message: string;
  details: { label: string; value: string }[];
  whatsappBody: string;
} {
  const isRent = input.kind === "rent";
  const title = isRent ? "Rent billed to your tenant" : "Bill issued to your tenant";
  const amount = plain(input.amount);
  const message = isRent
    ? `Rent of ${amount} has been billed to ${input.tenantName} for ${input.unitLabel} at ${input.propertyName}, due ${input.dueDate}.`
    : `${amount} was billed to ${input.tenantName} for ${input.unitLabel} at ${input.propertyName}, due ${input.dueDate}${input.title ? ` (${input.title})` : ""}.`;

  const details = [
    { label: "Property", value: input.propertyName },
    { label: "Unit", value: input.unitLabel },
    { label: "Tenant", value: input.tenantName },
    { label: isRent ? "Period" : "Bill", value: input.title },
    { label: "Amount", value: amount },
    { label: "Due", value: input.dueDate },
  ];

  return {
    title,
    message,
    details,
    whatsappBody: formatOwnerWhatsApp({
      heading: title,
      intro: "",
      lines: details,
      closing: "We will collect this on your behalf.",
    }),
  };
}

export function ownerChargeReminderCopy(input: {
  stage: "upcoming" | "due" | "overdue";
  kind: "rent" | "bill";
  propertyName: string;
  unitLabel: string;
  tenantName: string;
  amount: string;
  dueDate: string;
  title: string;
  daysOverdue?: number;
}): {
  title: string;
  message: string;
  details: { label: string; value: string }[];
  whatsappBody: string;
} {
  const noun = input.kind === "rent" ? "Rent" : "Bill";
  const title =
    input.stage === "upcoming"
      ? `${noun} due soon`
      : input.stage === "due"
        ? `${noun} due today`
        : `${noun} overdue`;

  const when =
    input.stage === "upcoming"
      ? `is due on ${input.dueDate}`
      : input.stage === "due"
        ? `is due today (${input.dueDate})`
        : `is ${input.daysOverdue === 1 ? "1 day" : `${input.daysOverdue} days`} overdue (due ${input.dueDate})`;

  const message = `${noun} of ${input.amount} for ${input.unitLabel} at ${input.propertyName} (${input.tenantName}) ${when}.`;

  const details = [
    { label: "Property", value: input.propertyName },
    { label: "Unit", value: input.unitLabel },
    { label: "Tenant", value: input.tenantName },
    { label: "Description", value: input.title },
    { label: "Amount outstanding", value: input.amount },
    { label: "Due", value: input.dueDate },
  ];

  return {
    title,
    message,
    details,
    whatsappBody: formatOwnerWhatsApp({
      heading: title,
      intro: "",
      lines: details,
      closing:
        input.stage === "overdue"
          ? "Please follow up with the tenant if needed, or reply here and we will assist."
          : "We will continue to collect on your behalf.",
    }),
  };
}

export function ownerServiceChargeCopy(input: {
  stage: "issued" | "upcoming" | "due" | "overdue" | "received" | "installment";
  propertyName: string;
  unitLabel: string;
  amount: string;
  dueDate?: string;
  invoiceNumber?: string;
  daysOverdue?: number;
  installmentLabel?: string;
}): {
  title: string;
  message: string;
  details: { label: string; value: string }[];
  whatsappBody: string;
} {
  const place = `${input.unitLabel} at ${input.propertyName}`;
  const titles: Record<typeof input.stage, string> = {
    issued: "Service charge invoice issued",
    upcoming: "Service charge due soon",
    due: "Service charge due today",
    overdue: "Service charge overdue",
    received: "Service charge received",
    installment: "Service charge installment due",
  };

  const intro =
    input.stage === "issued"
      ? `A service charge invoice has been issued for ${place}.`
      : input.stage === "upcoming"
        ? `Your service charge for ${place} is due on ${input.dueDate}.`
        : input.stage === "due"
          ? `Your service charge for ${place} is due today.`
          : input.stage === "overdue"
            ? `Your service charge for ${place} is ${input.daysOverdue === 1 ? "1 day" : `${input.daysOverdue} days`} overdue.`
            : input.stage === "received"
              ? `Payment of ${input.amount} has been recorded for ${place}. Next due: ${input.dueDate}.`
              : `${input.installmentLabel ?? "An installment"} of ${input.amount} for ${place} is due ${input.dueDate}.`;

  const details = [
    { label: "Property", value: input.propertyName },
    { label: "Unit", value: input.unitLabel },
    ...(input.invoiceNumber
      ? [{ label: "Invoice", value: `#${input.invoiceNumber}` }]
      : []),
    { label: "Amount", value: input.amount },
    ...(input.dueDate ? [{ label: "Due", value: input.dueDate }] : []),
    ...(input.installmentLabel
      ? [{ label: "Installment", value: input.installmentLabel }]
      : []),
  ];

  return {
    title: titles[input.stage],
    message: intro,
    details,
    whatsappBody: formatOwnerWhatsApp({
      heading: titles[input.stage],
      intro: "",
      lines: details,
      closing:
        input.stage === "received"
          ? "Thank you. The payment is on the ledger."
          : "Please settle by the due date, or reply here if you need anything from us.",
    }),
  };
}
