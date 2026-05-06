import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  TrafficSection,
  PERIODS,
  type Period,
} from "@/components/traffic-section";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Analytics");
  return { title: t("title") };
}

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale } = await params;
  const { period: rawPeriod } = await searchParams;
  const period: Period = PERIODS.includes(rawPeriod as Period)
    ? (rawPeriod as Period)
    : "day";

  return (
    <div className="space-y-6">
      <TrafficSection
        period={period}
        locale={locale}
        view="detailed"
        basePath="/analytics"
      />
    </div>
  );
}
