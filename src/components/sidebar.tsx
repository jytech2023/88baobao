import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

const navItems = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/analytics", key: "analytics" },
  { href: "/stores", key: "stores" },
  { href: "/menu", key: "menu" },
  { href: "/members", key: "members" },
  { href: "/reviews", key: "reviews" },
  { href: "/orders", key: "orders" },
  { href: "/campaigns", key: "campaigns" },
  { href: "/market", key: "market" },
  { href: "/settings", key: "settings" },
] as const;

export function Sidebar() {
  const tNav = useTranslations("Nav");
  const tBrand = useTranslations("Brand");

  return (
    <aside className="hidden w-60 shrink-0 border-r border-black/10 bg-white/50 p-4 md:block dark:border-white/10 dark:bg-black/20">
      <div className="mb-6">
        <div className="text-lg font-bold">{tBrand("name")}</div>
        <div className="text-xs text-black/60 dark:text-white/60">
          {tBrand("tagline")}
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="rounded-md px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
          >
            {tNav(item.key)}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
