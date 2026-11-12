"use client";
import { hardNavigate } from "./api";
import {
  ChartBar, ClipboardText, CreditCard, EnvelopeSimple, Gauge, Key, Notepad, Tray, List, ShieldCheck, SignOut, User, UsersThree, WebhooksLogo, X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { authClient } from "@/lib/auth/client";
import { OrgSwitcher } from "./org-switcher";

type IconType = typeof User;
interface NavItem { href: string; label: string; icon: IconType }

const MAIN: NavItem[] = [
  { href: "/app", label: "Inbox", icon: Tray },
  { href: "/app/forms", label: "Forms", icon: Notepad },
  { href: "/app/usage", label: "Usage", icon: ChartBar },
  { href: "/app/domains", label: "Sending domain", icon: EnvelopeSimple },
];
const SETTINGS: NavItem[] = [
  { href: "/app/settings/profile", label: "Profile", icon: User },
  { href: "/app/settings/security", label: "Security", icon: ShieldCheck },
  { href: "/app/settings/members", label: "Members", icon: UsersThree },
  { href: "/app/settings/api-keys", label: "API keys", icon: Key },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
  { href: "/app/settings/webhooks", label: "Webhooks", icon: WebhooksLogo },
  { href: "/app/settings/audit", label: "Audit log", icon: ClipboardText },
];

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = item.href === "/app" ? pathname === "/app" : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-3 rounded-sm px-3 py-2 body-5 transition-colors duration-300 focus-visible:focus-ring",
        active ? "bg-surface-raised font-medium text-text" : "cursor-pointer text-text-subtle hover:bg-surface-raised hover:text-text",
      )}
    >
      {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 bg-accent" /> : null}
      <Icon size={20} weight={active ? "fill" : "regular"} aria-hidden className={active ? "text-accent" : undefined} />
      {item.label}
    </Link>
  );
}

function SidebarBody({ org, user, isAdmin, pathname, onNavigate }: { org: { id: string; name: string }; user: { name: string; email: string }; isAdmin: boolean; pathname: string; onNavigate?: () => void }) {
  const [signingOut, setSigningOut] = useState(false);
  return (
    <div className="flex h-full flex-col gap-6">
      <OrgSwitcher activeId={org.id} activeName={org.name} />
      <nav aria-label="Main" className="flex flex-1 flex-col gap-6 overflow-y-auto">
        <div className="flex flex-col gap-1">
          {MAIN.map((i) => <NavLink key={i.href} item={i} pathname={pathname} onNavigate={onNavigate} />)}
        </div>
        <div className="flex flex-col gap-1">
          <p className="px-3 pb-1 label-mono text-text-subtle">Settings</p>
          {SETTINGS.map((i) => <NavLink key={i.href} item={i} pathname={pathname} onNavigate={onNavigate} />)}
        </div>
        {isAdmin ? (
          <div className="flex flex-col gap-1">
            <p className="px-3 pb-1 label-mono text-text-subtle">Founder</p>
            <NavLink item={{ href: "/admin", label: "Admin", icon: Gauge }} pathname={pathname} onNavigate={onNavigate} />
          </div>
        ) : null}
      </nav>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <p className="title-4 truncate text-text">{user.name || user.email}</p>
            {user.name ? <p className="caption-5 truncate text-text-subtle">{user.email}</p> : null}
          </div>
        </div>
        <button
          type="button"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await authClient.signOut();
            hardNavigate("/");
          }}
          className="flex min-h-11 items-center gap-3 cursor-pointer rounded-sm px-3 py-2 body-5 text-text-subtle transition-colors duration-300 hover:bg-surface-raised hover:text-text focus-visible:focus-ring disabled:opacity-50"
        >
          <SignOut size={20} weight="regular" aria-hidden />
          {signingOut ? "Signing out" : "Sign out"}
        </button>
      </div>
    </div>
  );
}

export function AppShell({ org, user, isAdmin, productName, banners, children }: {
  org: { id: string; name: string };
  user: { name: string; email: string };
  isAdmin: boolean;
  productName: string;
  banners?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="flex min-h-dvh flex-col bg-surface-raised lg:flex-row">
      <aside className="sticky top-0 hidden h-dvh w-2xs shrink-0 flex-col border-r border-border bg-surface p-4 text-text lg:flex">
        <div className="mb-6 px-3 pt-2">
          <Link href="/app" className="inline-flex min-h-11 items-center gap-2 heading-6 text-text focus-visible:focus-ring"><span aria-hidden className="size-3 rounded-xs bg-accent" />{productName}</Link>
        </div>
        <div className="min-h-0 flex-1">
          <SidebarBody org={org} user={user} isAdmin={isAdmin} pathname={pathname} />
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface px-4 py-2 text-text lg:hidden">
        <Link href="/app" className="inline-flex min-h-11 items-center gap-2 heading-6 text-text focus-visible:focus-ring"><span aria-hidden className="size-3 rounded-xs bg-accent" />{productName}</Link>
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(true)}
          className="inline-flex size-11 items-center justify-center cursor-pointer rounded-sm text-text transition-colors duration-300 hover:bg-surface-raised focus-visible:focus-ring"
        >
          <List size={24} weight="regular" aria-hidden />
        </button>
      </header>

      <div
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden={!open}
        className="fixed inset-0 z-40 flex flex-col gap-4 overflow-y-auto bg-surface p-4 text-text lg:hidden"
      >
        <div className="flex items-center justify-between">
          <span className="heading-6 text-text">{productName}</span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="inline-flex size-11 items-center justify-center cursor-pointer rounded-sm text-text transition-colors duration-300 hover:bg-surface-raised focus-visible:focus-ring"
          >
            <X size={24} weight="regular" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          {open ? <SidebarBody org={org} user={user} isAdmin={isAdmin} pathname={pathname} onNavigate={() => setOpen(false)} /> : null}
        </div>
      </div>

      <main id="main" className="min-w-0 flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {banners}
          {children}
        </div>
      </main>
    </div>
  );
}
