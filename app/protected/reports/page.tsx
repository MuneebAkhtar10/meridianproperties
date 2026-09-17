import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  ChevronRight,
  ClipboardList,
  FileClock,
  Landmark,
  ScrollText,
  TrendingUp,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { getAgreementExpiryAlerts } from "@/lib/agreement-expiry";
import { requireRole } from "@/lib/session";
import { UserType } from "@/lib/generated/prisma/client";

type ReportCard = {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  badge?: string;
};

/**
 * A single, professional landing page for every report this app already
 * produces — most were built as one-off pages/PDFs across separate specs
 * this session, with no shared place to discover them from. This just
 * indexes them; each card still owns its own data and filters.
 */
export default async function ReportsPage() {
  await requireRole(UserType.admin);

  const expiryAlerts = await getAgreementExpiryAlerts();
  const urgentExpiryCount = expiryAlerts.filter(
    (a) => a.daysRemaining <= 15,
  ).length;

  const cards: ReportCard[] = [
    {
      href: "/protected/reports/agreement-expiry",
      title: "Agreement Expiry",
      description:
        "Tenant, building and supplier agreements approaching or past expiry.",
      icon: <AlertTriangle className="h-5 w-5" />,
      iconBg: "bg-rose-50 text-rose-600",
      badge: urgentExpiryCount > 0 ? `${urgentExpiryCount} urgent` : undefined,
    },
    {
      href: "/protected/tenancies/report",
      title: "Tenant Report",
      description: "Every active tenancy for one property, with rent terms.",
      icon: <Users className="h-5 w-5" />,
      iconBg: "bg-indigo-50 text-indigo-600",
    },
    {
      href: "/protected/tenancies/agreements",
      title: "Agreement List",
      description: "Every tenant agreement across the portfolio, active and ended.",
      icon: <ScrollText className="h-5 w-5" />,
      iconBg: "bg-violet-50 text-violet-600",
    },
    {
      href: "/protected/finances/rent-position",
      title: "Rent Position",
      description: "Portfolio-wide paid / due / overdue rent, per unit.",
      icon: <Banknote className="h-5 w-5" />,
      iconBg: "bg-emerald-50 text-emerald-600",
    },
    {
      href: "/protected/finances/cheque-reminders",
      title: "Cheque Reminders",
      description: "Cheques due soon, awaiting clearance, or bounced.",
      icon: <FileClock className="h-5 w-5" />,
      iconBg: "bg-amber-50 text-amber-600",
    },
    {
      href: "/protected/service-charge-ledger/collection-position",
      title: "OA Collection Position",
      description: "Service charge collection across every owners' association.",
      icon: <Landmark className="h-5 w-5" />,
      iconBg: "bg-teal-50 text-teal-600",
    },
    {
      href: "/protected/service-charge-ledger",
      title: "Service Charge Ledger",
      description: "Every unit's service charge balance, portfolio-wide.",
      icon: <ClipboardList className="h-5 w-5" />,
      iconBg: "bg-sky-50 text-sky-600",
    },
    {
      href: "/protected/expenses?cashflow=1",
      title: "Cash Flow Statement",
      description: "Actual revenue and expenditure for one property, one fund.",
      icon: <TrendingUp className="h-5 w-5" />,
      iconBg: "bg-cyan-50 text-cyan-600",
    },
  ];

  return (
    <div className="w-full space-y-6 px-4 pt-4 pb-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Reports"
        description="Every report and export this app produces, in one place."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="block">
            <Card className="h-full border-border/60 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
              <div className="flex h-full items-start gap-3 p-4">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.iconBg}`}
                >
                  {card.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold tracking-tight">
                      {card.title}
                    </h3>
                    {card.badge && (
                      <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                        {card.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {card.description}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
