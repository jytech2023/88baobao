import { getTranslations } from "next-intl/server";

export default async function MenuPage() {
  const t = await getTranslations("Nav");
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t("menu")}</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        TODO: 菜品分类 / 菜品 CRUD / Cloudinary 上传 / 门店级覆盖
      </p>
    </div>
  );
}
