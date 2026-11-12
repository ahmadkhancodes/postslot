import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { Postmark } from "@/components/marketing/demo/postmark";
import { Timeline } from "@/components/marketing/demo/receipt";
import { product } from "@/config/product";

/** Split auth screen: the task on white at the left, a real receipt on manila at the right (desktop only). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-2">
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 heading-6 text-text focus-visible:focus-ring"><span aria-hidden className="size-3 rounded-xs bg-accent" />{product.name}</Link>
        </header>
        <main id="main" className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-10">
          <div className="mx-auto flex w-full max-w-md flex-col gap-8">{children}</div>
        </main>
        <footer className="px-4 py-6 sm:px-6 lg:px-10">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 body-6 text-text-subtle transition-colors duration-300 hover:text-text focus-visible:focus-ring">
            <ArrowLeft size={16} weight="regular" aria-hidden />
            Back to {product.name}
          </Link>
        </footer>
      </div>
      <aside aria-label="What a receipt looks like" className="hidden flex-col justify-center border-l border-border-receipt bg-surface-receipt px-16 lg:flex">
        <div className="flex max-w-md flex-col gap-6">
          <p className="heading-5 text-text">Your first stamp lands a few seconds after your first test.</p>
          <div className="flex flex-col gap-4 rounded border border-border-receipt bg-surface p-6 shadow-stamp">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="label-mono text-text-subtle">Delivery receipt</p>
                <p className="title-3 mt-1 text-text">Test submission</p>
              </div>
              <Postmark time="09:41:12" date="EXAMPLE" className="-mr-2 -mt-2 size-24 shrink-0" />
            </div>
            <div aria-hidden className="tear-line" />
            <Timeline steps={[{ name: "Received", time: "09:41:09" }, { name: "Sorted", time: "09:41:10" }, { name: "Dispatched", time: "09:41:10" }, { name: "Accepted", time: "09:41:12" }]} />
          </div>
          <p className="caption-5 text-text-subtle">Example data.</p>
        </div>
      </aside>
    </div>
  );
}
