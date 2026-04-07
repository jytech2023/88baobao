import { getTranslations } from "next-intl/server";

export default async function CampaignsPage() {
  const t = await getTranslations("Nav");
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t("campaigns")}</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        TODO: SMS (Twilio) / Email (Resend) 群发活动 / 触达自动化
      </p>
    </div>
  );
}
