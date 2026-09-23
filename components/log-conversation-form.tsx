"use client";

import { useContext, useState } from "react";

import { createCommunicationAction } from "@/app/communication-actions";
import { CloseModalOnSubmit, ModalCloseContext } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import {
  COMMUNICATION_ABOUT,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
} from "@/lib/communication-options";

export type CommunicationPartyOption = {
  id: string;
  label: string;
};

export function LogConversationForm({
  owners,
  tenants,
  workers,
  suppliers,
}: {
  owners: CommunicationPartyOption[];
  tenants: CommunicationPartyOption[];
  workers: CommunicationPartyOption[];
  suppliers: CommunicationPartyOption[];
}) {
  const [aboutKind, setAboutKind] = useState("owner");
  const close = useContext(ModalCloseContext);

  const partyOptions =
    aboutKind === "owner"
      ? owners
      : aboutKind === "tenant"
        ? tenants
        : aboutKind === "worker"
          ? workers
          : [];

  const partyNoun =
    aboutKind === "owner"
      ? "Owner"
      : aboutKind === "tenant"
        ? "Tenant"
        : aboutKind === "worker"
          ? "Worker"
          : aboutKind === "supplier"
            ? "Supplier"
            : "Name";

  return (
    <form action={createCommunicationAction} className="space-y-4">
      <CloseModalOnSubmit />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="comm-channel" className="text-xs">
            Channel
          </Label>
          <Select id="comm-channel" name="channel" defaultValue="phone" required>
            {COMMUNICATION_CHANNELS.map((channel) => (
              <option key={channel.value} value={channel.value}>
                {channel.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comm-direction" className="text-xs">
            Direction
          </Label>
          <Select id="comm-direction" name="direction" defaultValue="outbound" required>
            {COMMUNICATION_DIRECTIONS.map((direction) => (
              <option key={direction.value} value={direction.value}>
                {direction.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comm-about" className="text-xs">
            About
          </Label>
          <Select
            id="comm-about"
            name="aboutKind"
            value={aboutKind}
            onChange={(event) => setAboutKind(event.target.value)}
          >
            {COMMUNICATION_ABOUT.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comm-party" className="text-xs">
            {partyNoun}
          </Label>
          {aboutKind === "other" ? (
            <Input
              id="comm-party"
              name="otherName"
              placeholder="Who did you speak with?"
              required
            />
          ) : aboutKind === "supplier" ? (
            <Select id="comm-party" name="supplierId" defaultValue="" required>
              <option value="" disabled>
                Choose…
              </option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.label}
                </option>
              ))}
            </Select>
          ) : (
            <Select id="comm-party" name="partyUserId" defaultValue="" required>
              <option value="" disabled>
                Choose…
              </option>
              {partyOptions.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="comm-subject" className="text-xs">
          Subject
        </Label>
        <Input id="comm-subject" name="subject" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="comm-body" className="text-xs">
          What was said
        </Label>
        <Textarea
          id="comm-body"
          name="body"
          rows={4}
          required
          className="min-h-[6rem]"
        />
        <p className="text-[11px] text-muted-foreground">
          Enough that a colleague reading it next month understands what was agreed.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="comm-when" className="text-xs">
          When
        </Label>
        <Input id="comm-when" name="occurredAt" type="date" className="max-w-[12rem]" />
        <p className="text-[11px] text-muted-foreground">Leave empty for now.</p>
      </div>

      <div className="-mx-5 -mb-5 mt-2 flex justify-end gap-2 border-t bg-muted/30 px-5 py-3">
        {close && (
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
        )}
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}
