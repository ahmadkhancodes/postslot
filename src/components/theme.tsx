"use client";
import { Moon, Sun } from "@phosphor-icons/react/dist/ssr";
import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
};
const getTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => null);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      className={`inline-flex size-11 items-center justify-center rounded-md text-text-subtle transition-colors duration-300 hover:bg-surface-raised hover:text-text focus-visible:focus-ring ${className ?? ""}`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("theme", next); } catch {}
      }}
    >
      {theme === "dark" ? <Sun size={20} weight="regular" aria-hidden /> : <Moon size={20} weight="regular" aria-hidden />}
    </button>
  );
}
