import type {
  MaintenanceAttachment,
  MaintenanceRequest,
  SupplyRequest,
  TaskLog,
} from "@/lib/generated/prisma/client";

export type { MaintenanceAttachment, MaintenanceRequest, SupplyRequest, TaskLog };

export type Attachment = MaintenanceAttachment;

/** A worker's supply request, with the people involved shown by email. */
export type SupplyRequestWithUsers = SupplyRequest & {
  requestedBy: { email: string };
  decidedBy: { email: string } | null;
};

/** The unit an issue is in, plus the property it belongs to. */
export type UnitWithProperty = {
  id: string;
  label: string;
  floor: number | null;
  property: {
    name: string;
    propertyType: { hasFloors: boolean; unitPrefix: string | null };
  };
};

/** A request with everything needed to say who reported it and where it is. */
export type RequestWithPlace = MaintenanceRequest & {
  user: { email: string };
  unit: UnitWithProperty | null;
  /** Only present on pages that fetch it — treat as empty if omitted. */
  supplyRequests?: SupplyRequestWithUsers[];
};

export type TaskLogWithUser = TaskLog & {
  changedBy: { email: string } | null;
};
