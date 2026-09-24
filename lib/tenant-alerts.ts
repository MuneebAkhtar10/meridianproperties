import { formatOwnerWhatsApp } from "@/lib/owner-alerts";

/**
 * Tenant-, owner- and worker-facing message copy for payments and jobs.
 * Every builder returns the same four pieces the notification pipeline
 * uses — an in-app/email title and message, a details box for the email,
 * and a single-line WhatsApp body (Meta's utility template drops newlines,
 * so it is a labelled one-liner: "Heading | Label: value | closing").
 *
 * Audience matters: a tenant is told about THEIR payment ("Your payment was
 * received"); an owner is told about THEIR property ("Rent was received on
 * your property, collected by us on your behalf") — never the other way
 * round, and an owner never receives a tenant-directed message.
 */

export type AlertCopy = {
  title: string;
  message: string;
  details: { label: string; value: string }[];
  whatsappBody: string;
};

type Place = { propertyName: string; unitLabel: string };

function build(
  title: string,
  message: string,
  details: { label: string; value: string }[],
  closing: string,
): AlertCopy {
  return {
    title,
    message,
    details,
    whatsappBody: formatOwnerWhatsApp({
      heading: title,
      intro: `${title}: ${message}`,
      lines: details,
      closing,
    }),
  };
}

/* ── Tenant ─────────────────────────────────────────────────────────── */

export function tenantPaymentApprovedCopy(
  input: Place & { chargeTitle: string; amount: string; method?: string; paidOn?: string },
): AlertCopy {
  return build(
    "Payment received",
    `Thank you. Your payment of ${input.amount} for "${input.chargeTitle}" (${input.unitLabel}, ${input.propertyName}) has been received and approved.`,
    [
      { label: "Property", value: input.propertyName },
      { label: "Unit", value: input.unitLabel },
      { label: "Charge", value: input.chargeTitle },
      { label: "Amount paid", value: input.amount },
      { label: "Method", value: input.method ?? "" },
      { label: "Date", value: input.paidOn ?? "" },
    ],
    "This is your confirmation - no further action is needed.",
  );
}

export function tenantPaymentRejectedCopy(
  input: Place & { chargeTitle: string; reason?: string },
): AlertCopy {
  return build(
    "Payment not approved",
    `We could not approve your payment proof for "${input.chargeTitle}" (${input.unitLabel}, ${input.propertyName}).`,
    [
      { label: "Charge", value: input.chargeTitle },
      { label: "Reason", value: input.reason ?? "" },
    ],
    "Please check the note and submit the proof again from Rent & Bills, or reply here and we will help.",
  );
}

export function tenantChargeIssuedCopy(
  input: Place & { chargeTitle: string; amount: string; dueDate: string },
): AlertCopy {
  return build(
    "New amount due",
    `A new charge of ${input.amount} has been added for ${input.unitLabel} at ${input.propertyName}: "${input.chargeTitle}", due ${input.dueDate}.`,
    [
      { label: "Property", value: input.propertyName },
      { label: "Unit", value: input.unitLabel },
      { label: "Charge", value: input.chargeTitle },
      { label: "Amount", value: input.amount },
      { label: "Due", value: input.dueDate },
    ],
    "You can view and pay it from Rent & Bills.",
  );
}

export function tenantRentReminderCopy(
  input: Place & { monthLabel: string; amount: string; overdue: boolean },
): AlertCopy {
  const title = input.overdue ? "Rent reminder - overdue" : "Rent reminder";
  return build(
    title,
    input.overdue
      ? `Your rent for ${input.monthLabel} (${input.amount}) for ${input.unitLabel} at ${input.propertyName} is still pending.`
      : `Your rent for ${input.monthLabel} (${input.amount}) for ${input.unitLabel} at ${input.propertyName} is due.`,
    [
      { label: "Property", value: input.propertyName },
      { label: "Unit", value: input.unitLabel },
      { label: "Month", value: input.monthLabel },
      { label: "Amount due", value: input.amount },
    ],
    "Please arrange payment as soon as possible. If you have already paid, please ignore this message.",
  );
}

/* ── Property owner ─────────────────────────────────────────────────── */

export function ownerChargePaidCopy(
  input: Place & { kind: "rent" | "bill"; tenantName: string; chargeTitle: string; amount: string },
): AlertCopy {
  const noun = input.kind === "rent" ? "Rent" : "Bill";
  return build(
    `${noun} received on your property`,
    `${input.tenantName} has paid ${input.amount} for "${input.chargeTitle}" on ${input.unitLabel} at ${input.propertyName}. It was approved and recorded by property management.`,
    [
      { label: "Property", value: input.propertyName },
      { label: "Unit", value: input.unitLabel },
      { label: "Tenant", value: input.tenantName },
      { label: "Charge", value: input.chargeTitle },
      { label: "Amount received", value: input.amount },
    ],
    "No action is needed from you.",
  );
}

export function ownerPaymentProofCopy(
  input: Place & { tenantName: string; chargeTitle: string },
): AlertCopy {
  return build(
    "Tenant payment under review",
    `${input.tenantName} has submitted payment proof for "${input.chargeTitle}" on ${input.unitLabel} at ${input.propertyName}. We are reviewing it and will confirm once approved.`,
    [
      { label: "Property", value: input.propertyName },
      { label: "Unit", value: input.unitLabel },
      { label: "Tenant", value: input.tenantName },
      { label: "Charge", value: input.chargeTitle },
    ],
    "No action is needed from you.",
  );
}

/* ── Worker ─────────────────────────────────────────────────────────── */

export function workerTaskAssignedCopy(input: { jobTitle: string; place?: string }): AlertCopy {
  return build(
    "New maintenance job",
    input.place
      ? `You have been assigned a job: "${input.jobTitle}" at ${input.place}.`
      : `You have been assigned a job: "${input.jobTitle}".`,
    [
      { label: "Job", value: input.jobTitle },
      { label: "Location", value: input.place ?? "" },
    ],
    "Reply here when you are heading over, or open My Tasks for full details.",
  );
}

export function workerTaskReassignedCopy(input: { jobTitle: string }): AlertCopy {
  return build(
    "Job reassigned",
    `The job "${input.jobTitle}" has been reassigned to another team member. You no longer need to attend it.`,
    [{ label: "Job", value: input.jobTitle }],
    "Thank you - check My Tasks for your current jobs.",
  );
}
