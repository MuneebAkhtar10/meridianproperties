"use client";

import { Input, type InputProps } from "@/components/ui/input";
import { PHONE_MAX_LENGTH, sanitizePhoneInput } from "@/lib/phone";

/**
 * A phone number field that only ever contains digits and an optional
 * leading "+", capped at PHONE_MAX_LENGTH characters total (the "+" counts
 * toward that limit). Filters on every keystroke/paste so invalid characters
 * never make it into the field, rather than only flagging them on submit.
 */
export function PhoneInput({ onChange, ...props }: InputProps) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      maxLength={PHONE_MAX_LENGTH}
      onChange={(event) => {
        const sanitized = sanitizePhoneInput(event.target.value);
        if (sanitized !== event.target.value) {
          event.target.value = sanitized;
        }
        onChange?.(event);
      }}
    />
  );
}
