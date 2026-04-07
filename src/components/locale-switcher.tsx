"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { useTransition } from "react";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const switchTo = (next: "zh" | "en") => {
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  };

  return (
    <div className="flex items-center gap-1 text-xs">
      <button
        onClick={() => switchTo("zh")}
        disabled={isPending}
        className={`rounded px-2 py-1 ${locale === "zh" ? "bg-black text-white dark:bg-white dark:text-black" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
      >
        中文
      </button>
      <button
        onClick={() => switchTo("en")}
        disabled={isPending}
        className={`rounded px-2 py-1 ${locale === "en" ? "bg-black text-white dark:bg-white dark:text-black" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
      >
        EN
      </button>
    </div>
  );
}
