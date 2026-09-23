"use client";

import type { ReactNode } from "react";
import { MessageSquarePlus } from "lucide-react";

import {
  LogConversationForm,
  type CommunicationPartyOption,
} from "@/components/log-conversation-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export function LogConversationModal({
  owners,
  tenants,
  workers,
  suppliers,
  trigger,
}: {
  owners: CommunicationPartyOption[];
  tenants: CommunicationPartyOption[];
  workers: CommunicationPartyOption[];
  suppliers: CommunicationPartyOption[];
  trigger?: ReactNode;
}) {
  return (
    <Modal
      title="Log a conversation"
      description="A call, a visit, or a message sent from a personal phone — so the history is complete."
      widthClassName="max-w-lg"
      trigger={
        trigger ?? (
          <Button type="button" variant="outline">
            <MessageSquarePlus className="h-4 w-4" />
            Log a conversation
          </Button>
        )
      }
    >
      <LogConversationForm
        owners={owners}
        tenants={tenants}
        workers={workers}
        suppliers={suppliers}
      />
    </Modal>
  );
}
