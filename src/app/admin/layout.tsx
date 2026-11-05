import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme";
import { product } from "@/config/product";
import { isFounderAdmin, requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const s = await requireUser({ redirectTo: "/admin" });
  if (!isFounderAdmin(s.user.email)) notFound();
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-x-4 border-b border-border px-4 py-2 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center gap-x-4">
          <span className="heading-6 text-text">{product.name} admin</span>
          <Link href="/app" className="inline-flex min-h-11 items-center gap-2 body-6 text-text-subtle transition-colors duration-300 hover:text-text focus-visible:focus-ring">
            <ArrowLeft size={16} weight="regular" aria-hidden />
            Back to app
          </Link>
          <nav aria-label="Admin" className="flex items-center gap-1">
            <Link href="/admin" className="inline-flex min-h-11 items-center rounded-md px-3 body-6 text-text-subtle transition-colors duration-300 hover:text-text focus-visible:focus-ring">Overview</Link>
            <Link href="/admin/suppressions" className="inline-flex min-h-11 items-center rounded-md px-3 body-6 text-text-subtle transition-colors duration-300 hover:text-text focus-visible:focus-ring">Suppressions</Link>
          </nav>
        </div>
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">{children}</main>
    </div>
  );
}
