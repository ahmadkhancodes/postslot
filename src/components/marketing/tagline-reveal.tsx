"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Section } from "@/components/ui/layout";

/** Time between two words lighting up, so a whole line never flips at once. */
export const WORD_STEP_MS = 70;

/**
 * Tagline reveal (skill B11). Each word has its own IntersectionObserver entry; when a word crosses the trigger line
 * (40% above the bottom of the viewport) every word up to it is queued and lit one at a time, in reading order, once.
 * Reduced motion: every word is lit at once (and the CSS shows full ink regardless).
 */
export function TaglineReveal({ text, label }: { text: string; label?: string }) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const ref = useRef<HTMLParagraphElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const total = words.length;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") {
      // The CSS already shows full ink under reduced motion; mark the words lit too, outside the effect body.
      const t = setTimeout(() => setActive(total), 0);
      return () => clearTimeout(t);
    }
    let target = 0;
    let lit = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const step = () => {
      timer = null;
      if (lit >= target) return;
      lit += 1;
      setActive(lit);
      if (lit < target) timer = setTimeout(step, WORD_STEP_MS);
    };
    const spans = Array.from(el.querySelectorAll<HTMLElement>("[data-word]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting && e.boundingClientRect.top > 0) continue;
          const i = Number((e.target as HTMLElement).dataset.word);
          if (i + 1 > target) target = i + 1;
          io.unobserve(e.target);
        }
        if (!timer && lit < target) step();
      },
      { rootMargin: "0px 0px -40% 0px" },
    );
    spans.forEach((s) => io.observe(s));
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [words.length]);

  return (
    <Section>
      {label ? <p className="caption-3 mb-6 text-text-subtle">{label}</p> : null}
      <p ref={ref} className="heading-3 max-w-[680px] text-text md:heading-2">
        {words.map((w, i) => (
          <span key={i} data-word={i} className="kit-word" data-on={i < active}>
            {w}{i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
    </Section>
  );
}
