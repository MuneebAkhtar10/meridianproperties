import "server-only";

import { format } from "date-fns";

import { formatMoney } from "@/lib/finance";
import { buildTenantInvoiceNotice } from "@/lib/notifications";
import { renderNotificationEmail } from "@/lib/email";
import { formatOwnerWhatsApp, ownerServiceChargeCopy } from "@/lib/owner-alerts";
import { tenantChargeWaivedCopy, tenantWelcomeCopy } from "@/lib/tenant-alerts";
import { prisma } from "@/lib/prisma";
import { formatUnitLabel } from "@/lib/property-types";
import { formatWhatsAppText } from "@/lib/whatsapp";

/** What one alert will look like on each channel — built from the same
 * pieces the real send uses, so the preview never drifts from it. */
export type AlertPreview = {
  /** Who the message goes to — the tenant or the property owner. */
  recipient: {
    name: string;
    role: "Tenant" | "Property owner";
    email: string | null;
    phone: string | null;
  };
  email: { subject: string; html: string };
  /** What the admin can edit before sending. */
  editable: {
    title: string;
    /** The standard sentence — the editor starts with this. */
    message: string;
    details: { label: string; value: string }[];
    /** The email with a token where an edited message goes; empty when the
     * message is left as the standard one. */
    emailHtmlWithNote: string;
  };
  whatsapp: {
    /** The multi-line message, delivered when the recipient has messaged
     * the business number in the last 24 hours. */
    rich: string;
    /** The one-line approved-template version, used outside that window. */
    flat: string;
  };
};

export function whatsappPreview(parts: {
  title: string;
  message: string;
  details: { label: string; value: string }[];
  closing?: string;
}): AlertPreview["whatsapp"] {
  return {
    rich: formatWhatsAppText({ ...parts }),
    flat: formatOwnerWhatsApp({
      heading: parts.title,
      intro: `${parts.title}: ${parts.message}`,
      lines: parts.details,
      closing: parts.closing,
    }),
  };
}

/** The "Resend invoice email" notice for a rent/bill charge. */
export async function tenantInvoicePreview(chargeId: string): Promise<AlertPreview | null> {
  const charge = await prisma.charge.findUnique({
    where: { id: chargeId },
    include: {
      tenant: {
        select: { email: true, firstName: true, lastName: true, phone: true },
      },
      unit: { include: { property: { include: { propertyType: true } } } },
    },
  });
  if (!charge) return null;

  const tenantName =
    [charge.tenant.firstName, charge.tenant.lastName].filter(Boolean).join(" ") ||
    charge.tenant.email;
  const notice = buildTenantInvoiceNotice({
    tenantId: charge.tenantId,
    tenantName,
    propertyName: charge.unit.property.name,
    unitLabel: formatUnitLabel(charge.unit.property.propertyType, charge.unit.label),
    invoiceRef: charge.id,
    dueDate: format(charge.dueDate, "d MMMM yyyy"),
    href: `/protected/finances/${charge.id}`,
    lineItems: [{ label: charge.title, amount: formatMoney(charge.amount) }],
    total: formatMoney(charge.amount),
  });

  return {
    recipient: {
      name: tenantName,
      role: "Tenant",
      email: charge.tenant.email,
      phone: charge.tenant.phone,
    },
    email: { subject: notice.title, html: notice.emailHtml },
    editable: {
      title: notice.title,
      message: notice.message,
      details: notice.details,
      emailHtmlWithNote: buildTenantInvoiceNotice({
        tenantId: charge.tenantId,
        tenantName,
        propertyName: charge.unit.property.name,
        unitLabel: formatUnitLabel(charge.unit.property.propertyType, charge.unit.label),
        invoiceRef: charge.id,
        dueDate: format(charge.dueDate, "d MMMM yyyy"),
        href: `/protected/finances/${charge.id}`,
        lineItems: [{ label: charge.title, amount: formatMoney(charge.amount) }],
        total: formatMoney(charge.amount),
        customMessage: "__ALERT_NOTE__",
      }).emailHtml,
    },
    whatsapp: whatsappPreview({
      title: notice.title,
      message: notice.message,
      details: notice.details,
    }),
  };
}

/** The notice the tenant receives when an admin waives a charge. */
export async function waiveChargePreview(chargeId: string): Promise<AlertPreview | null> {
  const charge = await prisma.charge.findUnique({
    where: { id: chargeId },
    include: {
      tenant: { select: { email: true, firstName: true, lastName: true, phone: true } },
      unit: { include: { property: { include: { propertyType: true } } } },
    },
  });
  if (!charge) return null;

  const tenantName =
    [charge.tenant.firstName, charge.tenant.lastName].filter(Boolean).join(" ") ||
    charge.tenant.email;
  const copy = tenantChargeWaivedCopy({
    propertyName: charge.unit.property.name,
    unitLabel: formatUnitLabel(charge.unit.property.propertyType, charge.unit.label),
    chargeTitle: charge.title,
    amount: formatMoney(charge.amount),
  });
  const href = `/protected/finances/${charge.id}`;
  const greeting = charge.tenant.firstName?.trim() ? `Dear ${charge.tenant.firstName.trim()}` : undefined;
  const closing = "No action is needed from you. Reply here if you have any questions.";

  return {
    recipient: {
      name: tenantName,
      role: "Tenant",
      email: charge.tenant.email,
      phone: charge.tenant.phone,
    },
    email: {
      subject: copy.title,
      html: renderNotificationEmail(copy.title, copy.message, href, copy.details, greeting, closing),
    },
    editable: {
      title: copy.title,
      message: copy.message,
      details: copy.details,
      emailHtmlWithNote: renderNotificationEmail(copy.title, "__ALERT_NOTE__", href, copy.details, greeting, closing),
    },
    whatsapp: whatsappPreview({
      title: copy.title,
      message: copy.message,
      details: copy.details,
      closing: "No action is needed from you. Reply here if you have any questions.",
    }),
  };
}

/** The notice a property owner receives when a service charge invoice is
 * sent — always to the owner, never a tenant. */
export async function serviceChargeInvoicePreview(invoiceId: string): Promise<AlertPreview | null> {
  const invoice = await prisma.serviceChargeInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      invoiceNumber: true,
      dueDate: true,
      amountPayable: true,
      currentAmount: true,
      kind: true,
      billedOwner: { select: { firstName: true, lastName: true, email: true, phone: true } },
      unit: {
        select: {
          label: true,
          owner: { select: { firstName: true, lastName: true, email: true, phone: true } },
          property: {
            select: { name: true, propertyType: { select: { unitPrefix: true, hasFloors: true } } },
          },
        },
      },
    },
  });
  if (!invoice) return null;

  const owner = invoice.unit.owner ?? invoice.billedOwner;
  if (!owner) return null;
  const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email;
  const additional = invoice.kind === "additional";
  const copy = ownerServiceChargeCopy({
    stage: "issued",
    propertyName: invoice.unit.property.name,
    unitLabel: formatUnitLabel(invoice.unit.property.propertyType, invoice.unit.label),
    amount: formatMoney(additional ? invoice.currentAmount : invoice.amountPayable),
    dueDate: format(invoice.dueDate, "d MMM yyyy"),
    invoiceNumber: invoice.invoiceNumber,
    additionalCharge: additional,
  });
  const details = [...copy.details, { label: "Invoice PDF", value: "Attached to this message" }];
  const greeting = owner.firstName?.trim() ? `Dear ${owner.firstName.trim()}` : undefined;
  const closing = "Please settle by the due date, or reply here if you need anything from us.";
  // No "Open PropertyCare" button for owners — see dispatchExternalChannels
  // in lib/notifications.ts, which applies the same rule to every owner
  // email, not just this one.

  return {
    recipient: { name: ownerName, role: "Property owner", email: owner.email, phone: owner.phone },
    email: {
      subject: copy.title,
      html: renderNotificationEmail(copy.title, copy.message, undefined, details, greeting, closing),
    },
    editable: {
      title: copy.title,
      message: copy.message,
      details,
      emailHtmlWithNote: renderNotificationEmail(
        copy.title,
        "__ALERT_NOTE__",
        undefined,
        details,
        greeting,
        closing,
      ),
    },
    whatsapp: whatsappPreview({ title: copy.title, message: copy.message, details, closing }),
  };
}

/** The move-in welcome notice for a tenancy — resent from the Tenancies
 * page's "Welcome email" action, with the tenancy's current terms. */
export async function tenantWelcomePreview(tenancyId: string): Promise<AlertPreview | null> {
  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    include: {
      tenant: { select: { email: true, firstName: true, lastName: true, phone: true } },
      unit: { include: { property: { include: { propertyType: true } } } },
    },
  });
  if (!tenancy) return null;

  const tenantName =
    [tenancy.tenant.firstName, tenancy.tenant.lastName].filter(Boolean).join(" ") ||
    tenancy.tenant.email;
  const placeholderTerms = Number(tenancy.monthlyRent) === 0;
  const terms = placeholderTerms
    ? []
    : [
        { label: "Monthly rent", value: formatMoney(tenancy.monthlyRent) },
        { label: "Rent due day", value: `${tenancy.rentDueDay} of each month` },
        ...(Number(tenancy.securityDeposit) > 0
          ? [{ label: "Security deposit", value: formatMoney(tenancy.securityDeposit) }]
          : []),
        ...(tenancy.leaseEndDate
          ? [{ label: "Lease end date", value: format(tenancy.leaseEndDate, "d MMMM yyyy") }]
          : []),
      ];

  const copy = tenantWelcomeCopy({
    propertyName: tenancy.unit.property.name,
    unitLabel: formatUnitLabel(tenancy.unit.property.propertyType, tenancy.unit.label),
    moveInDate: format(tenancy.startDate, "d MMMM yyyy"),
    terms,
  });
  const href = "/protected";
  const greeting = tenancy.tenant.firstName?.trim() ? `Dear ${tenancy.tenant.firstName.trim()}` : undefined;
  const closing = terms.length
    ? "Reply here if you have any questions about your tenancy."
    : "Your rent and lease terms will be confirmed by property management shortly. Reply here if you need anything.";

  return {
    recipient: { name: tenantName, role: "Tenant", email: tenancy.tenant.email, phone: tenancy.tenant.phone },
    email: {
      subject: copy.title,
      html: renderNotificationEmail(copy.title, copy.message, href, copy.details, greeting, closing),
    },
    editable: {
      title: copy.title,
      message: copy.message,
      details: copy.details,
      emailHtmlWithNote: renderNotificationEmail(
        copy.title,
        "__ALERT_NOTE__",
        href,
        copy.details,
        greeting,
        closing,
      ),
    },
    whatsapp: whatsappPreview({ title: copy.title, message: copy.message, details: copy.details, closing }),
  };
}
