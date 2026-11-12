import { useId } from "react";

/**
 * The Postslot postmark (docs/DESIGN.md section 8): ring, text on a path, cancel lines. Ink = --accent.
 * Drawn on a 198 unit grid so its three texts sit on type scale steps (14, 20 and 12), not fractional sizes.
 */
export function Postmark({ label = "DELIVERED", time, date, className }: { label?: string; time: string; date: string; className?: string }) {
  const pathId = useId();
  return (
    <svg viewBox="0 0 198 198" role="img" aria-label={`Postmark: ${label.toLowerCase()} ${time}, ${date}`} className={`kit-postmark font-mono text-accent ${className ?? ""}`}>
      <defs><path id={pathId} d="M99 99m-71 0a71 71 0 1 1 142 0" /></defs>
      <circle cx="99" cy="99" r="92" fill="none" stroke="currentColor" strokeWidth="3.3" />
      <circle cx="99" cy="99" r="54" fill="none" stroke="currentColor" strokeWidth="2" />
      <text fill="currentColor" fontSize="14" fontWeight="500" letterSpacing="2.1">
        <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">{`POSTSLOT · ${label}`}</textPath>
      </text>
      <path d="M36 158h126M46 168h106M59 178h80" stroke="currentColor" strokeWidth="2.3" fill="none" strokeLinecap="round" />
      <text fill="currentColor" x="99" y="96" textAnchor="middle" fontSize="20" fontWeight="500">{time}</text>
      <text fill="currentColor" x="99" y="116" textAnchor="middle" fontSize="12" letterSpacing="1">{date}</text>
    </svg>
  );
}
