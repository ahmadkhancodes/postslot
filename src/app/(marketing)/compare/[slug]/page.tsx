import type { Metadata } from "next";
import { ogImageUrl, twitterImageUrl } from "@/lib/seo";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/layout";
import { CompareTable } from "@/components/marketing/compare-table";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { comparisonBySlug, comparisons } from "@/content/compare";
import { product } from "@/config/product";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = comparisonBySlug(slug);
  if (!entry) return {};
  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: `/compare/${entry.slug}` },
    openGraph: { title: entry.title, description: entry.description, url: `/compare/${entry.slug}`, images: [ogImageUrl()] },
    twitter: { card: "summary_large_image", title: entry.title, description: entry.description, images: [twitterImageUrl()] },
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const entry = comparisonBySlug(slug);
  if (!entry) notFound();

  return (
    <>
      <Section labelledBy="compare-title">
        <div className="flex max-w-2xl flex-col items-start gap-6">
          <h1 id="compare-title" className="hero-gradient-text heading-3 md:heading-1">{entry.headline}</h1>
          <p className="body-3 text-text-subtle md:title-1">{entry.intro}</p>
          <ButtonLink href="/sign-in" size="lg">Start free</ButtonLink>
        </div>
        <div className="mt-12 md:mt-16">
          <CompareTable
            caption={`${product.name} compared with ${entry.competitor}`}
            columns={[entry.competitor, product.name]}
            highlightColumn={1}
            rows={entry.rows.map((r) => ({ label: r.label, values: [...r.values] }))}
          />
        </div>
        <p className="caption-2 mt-4 max-w-2xl text-text-subtle">
          Checked {entry.checked} from public pages. Source:{" "}
          <a href={entry.source.url} rel="noopener nofollow" className="text-action underline underline-offset-4 hover:text-action-hover focus-visible:focus-ring">{entry.source.label}</a>.
          {" "}Not affiliated with {entry.competitor}.
        </p>
        <p className="body-6 mt-6 max-w-2xl text-text-subtle">{entry.fitNote}</p>
      </Section>
      <Section tone="raised" labelledBy="migrate-title">
        <h2 id="migrate-title" className="heading-4 md:heading-2 max-w-2xl text-text">Moving takes one action URL</h2>
        <ol className="mt-8 flex max-w-2xl list-decimal flex-col gap-2 pl-6 body-3 text-text-subtle">
          {entry.migration.map((m) => <li key={m}>{m}</li>)}
        </ol>
      </Section>
      <Faq title="Common questions" items={entry.faq} />
      <FinalCta
        title={`Try ${product.name} on one form`}
        body="Point a form at your endpoint and watch the first delivery receipt arrive."
        cta={{ href: "/sign-in", label: "Start free" }}
        note="No credit card needed."
      />
    </>
  );
}
