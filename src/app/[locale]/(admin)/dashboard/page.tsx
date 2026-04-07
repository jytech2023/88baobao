import { getTranslations } from "next-intl/server";

export default async function DashboardPage() {
  const t = await getTranslations("Nav");
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t("dashboard")}</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        TODO: 总览卡片（11 店健康度 / 评分 / 销售 / 差评）
      </p>
    </div>
  );
}
