import Link from "next/link";
import { cn } from "@/components/ui/cn";

const TABS = [
  { key: "install", label: "Install and settings", href: (id: string) => `/app/forms/${id}` },
  { key: "onboarding", label: "Check and test", href: (id: string) => `/app/forms/${id}/onboarding` },
  { key: "templates", label: "Email template", href: (id: string) => `/app/forms/${id}/templates` },
  { key: "webhooks", label: "Webhooks", href: (id: string) => `/app/forms/${id}/webhooks` },
] as const;

/** Section links shared by the form pages. */
export function FormTabs({ id, active }: { id: string; active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Form sections" className="mb-6 flex gap-2 overflow-x-auto border-b border-border">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href(id)}
          aria-current={t.key === active ? "page" : undefined}
          className={cn("relative flex min-h-11 min-w-11 items-center justify-center whitespace-nowrap px-2 body-5 transition-colors duration-300 focus-visible:focus-ring", t.key === active ? "text-text after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent" : "text-text-subtle hover:text-text")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
