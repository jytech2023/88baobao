import { getTranslations } from "next-intl/server";

export default async function MembersPage() {
  const t = await getTranslations("Nav");
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t("members")}</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        TODO: 会员列表 / 标签 / 券 / 分群
      </p>
    </div>
  );
}
