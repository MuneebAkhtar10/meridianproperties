import { PageHeader } from "@/components/page-header";
import { PublicReportForm } from "@/components/public-report-form";

/**
 * The logged-out landing page for the system-wide QR code (see
 * /protected/admin/qr-code). No auth at all — proxy.ts only gates
 * `/protected`, so this route is reachable by anyone who scans the code.
 * Identity is established inside the form itself, by phone number.
 */
export default function PublicReportIssuePage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <PageHeader
        title="Report an issue"
        description="Enter your phone number to get started, then tell us what needs fixing."
      />

      <PublicReportForm />
    </div>
  );
}
