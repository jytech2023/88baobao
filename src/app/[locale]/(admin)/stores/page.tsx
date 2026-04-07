import { getTranslations } from "next-intl/server";

export default async function StoresPage() {
  const t = await getTranslations("Nav");
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t("stores")}</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        TODO: 11 家门店列表 + 新建/编辑 + 从官网爬取导入
      </p>
    </div>
  );
}
