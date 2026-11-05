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
    <nav aria-label="Form sections" className="-mx-1 mb-6 flex gap-1 overflow-x-auto px-1">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href(id)}
          aria-current={t.key === active ? "page" : undefined}
          className={cn("flex min-h-11 items-center whitespace-nowrap rounded-md px-3 body-5 transition-colors duration-300 focus-visible:focus-ring", t.key === active ? "bg-surface-sunken text-text" : "text-text-subtle hover:bg-surface-raised hover:text-text")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
