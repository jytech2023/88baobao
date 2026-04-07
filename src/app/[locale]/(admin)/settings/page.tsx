import { getTranslations } from "next-intl/server";

export default async function SettingsPage() {
  const t = await getTranslations("Nav");
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t("settings")}</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        TODO: 用户管理 / 第三方密钥 / 告警 webhook
      </p>
    </div>
  );
}
