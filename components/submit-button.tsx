"use client";

import { Button } from "@/components/ui/button";
import { LoaderCircle } from "lucide-react";
import { type ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type Props = ComponentProps<typeof Button> & {
  pendingText?: string;
};

export function SubmitButton({
  children,
  pendingText = "Submitting...",
  ...props
}: Props) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      aria-disabled={pending}
      {...props}
      disabled={pending || props.disabled}
    >
      {pending && (
        <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
      )}
      {pending ? pendingText : children}
    </Button>
  );
}
