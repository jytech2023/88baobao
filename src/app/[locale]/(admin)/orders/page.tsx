import { getTranslations } from "next-intl/server";

export default async function OrdersPage() {
  const t = await getTranslations("Nav");
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t("orders")}</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        TODO: DoorDash / UberEats / Grubhub CSV 导入与销售报表
      </p>
    </div>
  );
}
