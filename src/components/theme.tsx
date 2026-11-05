"use client";
import { Moon, Sun } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";

/** Runs before paint (in <head>) so there is no flash: stored choice, else the OS preference. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => setTheme((document.documentElement.dataset.theme as "light" | "dark") ?? "light"), []);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      className={`inline-flex size-11 items-center justify-center rounded-md text-text-subtle transition-colors duration-300 hover:bg-surface-raised hover:text-text focus-visible:focus-ring ${className ?? ""}`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("theme", next); } catch {}
        setTheme(next);
      }}
    >
      {theme === "dark" ? <Sun size={20} weight="regular" aria-hidden /> : <Moon size={20} weight="regular" aria-hidden />}
    </button>
  );
}
