export type NamedPerson = {
  firstName: string | null;
  lastName: string | null;
  email: string;
};

export function personName(person: NamedPerson | null | undefined): string | null {
  if (!person) return null;
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
  return name || person.email || null;
}

/**
 * Who owned a unit on `asOf`. Transfers end the old ownership and start the
 * new one on the same date, so a transfer on that day belongs to the new
 * owner. When `billedOwner` was snapshotted at write time, that wins.
 */
export function ownerAtDate(input: {
  asOf: Date;
  currentOwner: NamedPerson | null;
  billedOwner?: NamedPerson | null;
  transfers: { transferDate: Date; fromOwner: NamedPerson | null }[];
}): NamedPerson | null {
  if (input.billedOwner) return input.billedOwner;

  const asOf = new Date(input.asOf).getTime();
  const later = input.transfers
    .filter((transfer) => new Date(transfer.transferDate).getTime() > asOf)
    .sort(
      (a, b) =>
        new Date(a.transferDate).getTime() - new Date(b.transferDate).getTime(),
    );

  if (later[0]) return later[0].fromOwner;
  return input.currentOwner;
}
