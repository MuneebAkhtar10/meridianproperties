"use client";

import { Button } from "@/components/ui/button";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type Props = ComponentProps<typeof Button> & {
  pendingText?: string;
};

export function SubmitButton({
  children,
  pendingText = "Submitting...",
  onClick,
  ...props
}: Props) {
  const { pending: formPending } = useFormStatus();
  // A button that submits a *different* form through the `form=""` attribute
  // (e.g. inside a modal that is portalled away from its form) is not inside
  // that form, so useFormStatus can't see it pending — track the click itself.
  const [clicked, setClicked] = useState(false);
  const submitsOtherForm = Boolean(props.form);
  const pending = formPending || clicked;

  useEffect(() => {
    if (!clicked) return;
    // The page navigates or refreshes on completion; this only covers a
    // submit that fails to leave the page, so the button never stays stuck.
    const timer = setTimeout(() => setClicked(false), 20000);
    return () => clearTimeout(timer);
  }, [clicked]);

  return (
    <Button
      type="submit"
      aria-disabled={pending}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (submitsOtherForm && !event.defaultPrevented) {
          // Deferred so the button isn't disabled before the browser has
          // started the submit.
          setTimeout(() => setClicked(true), 0);
        }
      }}
      disabled={pending || props.disabled}
    >
      {pending && (
        <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
      )}
      {pending ? pendingText : children}
    </Button>
  );
}
