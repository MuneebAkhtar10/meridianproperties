import { LayoutProps } from "@/types/page";
import { requireUser } from "@/lib/session";

export default async function ProtectedLayout({ children }: LayoutProps) {
  await requireUser();

  // The live event stream is opened once for the whole signed-in shell, up in
  // the root layout, so that the notification bell sits inside it too.
  return <>{children}</>;
}
