import Link from "next/link";
import { Container } from "@/components/ui/layout";
import { docGroups } from "@/content/docs";
import { product } from "@/config/product";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Documentation",
  description: `Install snippets for every stack, plus guides and reference for the ${product.name} API, authentication, billing and webhooks.`,
  path: "/docs",
});

export default function DocsIndexPage() {
  return (
    <Container className="py-12 md:py-20">
      <header className="mb-12 flex max-w-3xl flex-col gap-3">
        <h1 className="heading-3 text-text md:heading-2">Documentation</h1>
        <p className="body-3 text-text-subtle">How to point a form at {product.name}, read a delivery receipt, tune spam filtering and wire up webhooks.</p>
      </header>
      <div className="flex flex-col gap-12">
        {docGroups.map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`} className="grid gap-4 border-t border-text pt-6 lg:grid-cols-12 lg:gap-12">
            <h2 id={`g-${g.title}`} className="heading-6 text-text lg:col-span-3">{g.title}</h2>
            <ul className="grid gap-x-8 md:grid-cols-2 lg:col-span-9">
              {g.docs.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/docs/${d.slug}`}
                    className="group flex h-full flex-col gap-1 border-b border-border py-4 focus-visible:focus-ring"
                  >
                    <span className="title-3 text-text underline decoration-transparent underline-offset-4 transition-colors duration-300 group-hover:text-accent group-hover:decoration-accent">{d.title}</span>
                    <span className="body-6 text-text-subtle">{d.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Container>
  );
}
