"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server component every 5 s while a delivery is still open (receipt can change). */
export function AutoRefresh({ active, everyMs = 5000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}
