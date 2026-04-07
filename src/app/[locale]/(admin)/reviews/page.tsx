import { getTranslations } from "next-intl/server";

export default async function ReviewsPage() {
  const t = await getTranslations("Nav");
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t("reviews")}</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        TODO: Google / 小红书点评聚合 / LLM 分类 / 差评告警 / 回复草稿
      </p>
    </div>
  );
}
