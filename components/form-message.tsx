import { AlertCircle, CheckCircle2, Info } from "lucide-react";

export type Message =
  | { success: string }
  | { error: string }
  | { message: string };

export function FormMessage({ message }: { message: Message }) {
  if ("success" in message) {
    return (
      <Banner
        icon={<CheckCircle2 className="h-4 w-4" />}
        className="border-emerald-200 bg-emerald-50 text-emerald-800"
      >
        {message.success}
      </Banner>
    );
  }

  if ("error" in message) {
    return (
      <Banner
        icon={<AlertCircle className="h-4 w-4" />}
        className="border-destructive/30 bg-destructive/5 text-destructive"
      >
        {message.error}
      </Banner>
    );
  }

  if ("message" in message) {
    return (
      <Banner icon={<Info className="h-4 w-4" />} className="bg-muted">
        {message.message}
      </Banner>
    );
  }

  return null;
}

function Banner({
  icon,
  className,
  children,
}: {
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${className}`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  );
}
