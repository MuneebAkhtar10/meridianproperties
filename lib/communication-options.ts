export const COMMUNICATION_CHANNELS = [
  { value: "phone", label: "Phone call" },
  { value: "in_person", label: "In person" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
  { value: "other", label: "Other" },
] as const;

export const COMMUNICATION_DIRECTIONS = [
  { value: "outbound", label: "We contacted them" },
  { value: "inbound", label: "They contacted us" },
] as const;

export const COMMUNICATION_ABOUT = [
  { value: "owner", label: "Owner" },
  { value: "tenant", label: "Tenant" },
  { value: "supplier", label: "Supplier" },
  { value: "worker", label: "Worker" },
  { value: "other", label: "Other" },
] as const;

export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number]["value"];
export type CommunicationDirection = (typeof COMMUNICATION_DIRECTIONS)[number]["value"];
export type CommunicationAbout = (typeof COMMUNICATION_ABOUT)[number]["value"];

export const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(
  COMMUNICATION_CHANNELS.map((item) => [item.value, item.label]),
);

export const DIRECTION_LABEL: Record<string, string> = Object.fromEntries(
  COMMUNICATION_DIRECTIONS.map((item) => [item.value, item.label]),
);

export const ABOUT_LABEL: Record<string, string> = Object.fromEntries(
  COMMUNICATION_ABOUT.map((item) => [item.value, item.label]),
);
