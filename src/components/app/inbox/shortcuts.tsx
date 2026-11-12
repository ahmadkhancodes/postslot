"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** The key a shortcut press maps to, or null when typing in a field or using a modifier. Exported for tests. */
export function shortcutFor(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; target?: { tagName?: string; isContentEditable?: boolean } | null }): "next" | "prev" | "search" | "close" | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const tag = e.target?.tagName?.toUpperCase();
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable;
  if (e.key === "Escape") return typing ? null : "close";
  if (typing) return null;
  if (e.key === "j") return "next";
  if (e.key === "k") return "prev";
  if (e.key === "/") return "search";
  return null;
}

/** Inbox keyboard shortcuts: j / k move through the list, / jumps to search, Escape closes the open submission. */
export function InboxShortcuts({ hrefs, selected, listHref }: { hrefs: { id: string; href: string }[]; selected?: string; listHref: string }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ([...document.querySelectorAll("dialog[open], [role=dialog]")].some((d) => d.checkVisibility?.() ?? true)) return; // a modal is open
      const s = shortcutFor({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, target: e.target as HTMLElement | null });
      if (!s) return;
      const list = hrefs, sel = selected, back = listHref;
      if (s === "search") {
        const input = document.querySelector<HTMLInputElement>('input[name="q"]');
        if (input) { e.preventDefault(); input.focus(); input.select(); }
      } else if (s === "close") {
        if (sel) router.push(back);
      } else if (list.length) {
        const i = list.findIndex((r) => r.id === sel);
        const next = s === "next" ? Math.min(list.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
        e.preventDefault();
        router.push(list[next]!.href);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, hrefs, selected, listHref]);
  return null;
}
