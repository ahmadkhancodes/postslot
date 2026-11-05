import { useId } from "react";

/** The Postslot postmark (docs/DESIGN.md section 8): ring, text on a path, cancel lines. Ink = --action. */
export function Postmark({ label = "DELIVERED", time, date, className }: { label?: string; time: string; date: string; className?: string }) {
  const pathId = useId();
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={`Postmark: ${label.toLowerCase()} ${time}, ${date}`} className={`kit-postmark font-mono text-action ${className ?? ""}`}>
      <defs><path id={pathId} d="M60 60m-43 0a43 43 0 1 1 86 0" /></defs>
      <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="60" cy="60" r="33" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <text fill="currentColor" fontSize="8.5" fontWeight="500" letterSpacing="1.3">
        <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">{`POSTSLOT · ${label}`}</textPath>
      </text>
      <path d="M22 96h76M28 102h64M36 108h48" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <text fill="currentColor" x="60" y="58" textAnchor="middle" fontSize="12.5" fontWeight="500">{time}</text>
      <text fill="currentColor" x="60" y="70" textAnchor="middle" fontSize="7" letterSpacing=".6">{date}</text>
    </svg>
  );
}
