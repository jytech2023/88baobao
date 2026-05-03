import { LocaleSwitcher } from "./locale-switcher";

export function Topbar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-black/10 px-4 md:px-6 dark:border-white/10">
      <div className="text-sm font-medium md:hidden">88baobao</div>
      <div className="ml-auto flex items-center gap-3">
        <LocaleSwitcher />
      </div>
    </header>
  );
}
