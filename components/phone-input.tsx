"use client";

import { Input, type InputProps } from "@/components/ui/input";
import { sanitizePhoneInput } from "@/lib/phone";

/**
 * A phone number field that only ever contains digits and an optional
 * leading "+", capped at 12 characters total (the "+" counts toward the 12).
 * Filters on every keystroke/paste so invalid characters never make it into
 * the field, rather than only flagging them on submit.
 */
export function PhoneInput({ onChange, ...props }: InputProps) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      maxLength={12}
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
