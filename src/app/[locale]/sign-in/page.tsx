import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";

export default async function SignInPage() {
  const t = await getTranslations("Auth");
  const tBrand = await getTranslations("Brand");

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-black/10 p-8 dark:border-white/10">
        <div className="text-center">
          <h1 className="text-xl font-bold">{tBrand("name")}</h1>
          <p className="mt-1 text-xs text-black/60 dark:text-white/60">
            {tBrand("tagline")}
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("auth0", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black"
          >
            {t("signIn")} → Auth0
          </button>
        </form>
      </div>
    </div>
  );
}
