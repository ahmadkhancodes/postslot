import type { Metadata } from "next";
import { Section } from "@/components/ui/layout";
import { PricingTable } from "@/components/marketing/pricing-table";
import { Faq } from "@/components/marketing/faq";
import { planById, product } from "@/config/product";
import Link from "next/link";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const proYear = (planById("pro")?.prices.find((p) => p.interval === "year")?.usd ?? 0) / 100;

const title = "Pricing";
const description = `${product.name} plans from free to agency. Spam never counts toward your quota and over-limit submissions are held, never dropped.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/pricing" },
  openGraph: { title: `${title} · ${product.fullName}`, description, url: "/pricing" },
};

const billingFaq = [
  { q: "Can I cancel anytime?", a: "Yes. You can cancel a paid plan from your account whenever you like." },
  { q: "Does spam count toward my submission quota?", a: "No. Submissions blocked as spam never count toward your monthly quota on any plan." },
  { q: "What happens if I go over my limit?", a: "Submissions over the limit are held, not dropped. They wait in your inbox so you can release them once you have upgraded." },
  { q: "Do I need a credit card for the Free plan?", a: "No. Start on Free with no card and move to a paid plan when you need more." },
  { q: "Can I pay monthly instead of yearly?", a: "Pro and Agency can be billed monthly or yearly. Starter is billed yearly only." },
];

export default function PricingPage() {
  return (
    <>
      <Section labelledBy="pricing-title">
        <h1 className="sr-only">{title}</h1>
        <PricingTable title="Half the price. None of the guesswork." />
        <p className="body-6 mt-6 max-w-2xl text-text-subtle">
          Pro: 10,000 submissions a month for ${proYear} a year or $7.49 a month. Web3Forms (web3forms.com) Pro is $149 a year or $15 a month for the same 10,000 (checked 3 Nov 2026, not affiliated).{" "}
          <Link href="/compare/web3forms" className="text-action underline underline-offset-4 hover:text-action-hover focus-visible:focus-ring">See the comparison</Link>
        </p>
      </Section>
      <Section tone="raised" labelledBy="addons-title">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="flex flex-col gap-4 lg:col-span-5">
            <h2 id="addons-title" className="heading-4 md:heading-2 text-text">Add ons and the limit</h2>
            <p className="body-3 text-text-subtle">
              The meter is {product.meter.unit}. Spam and test submissions do not count. Over the limit we keep accepting: legitimate submissions are held in your inbox and released when you upgrade or the month resets. You get a notice at 80% and 100%.
            </p>
            <p className="body-6 text-text-subtle">Need more than 20,000 a month? Contact us for volume pricing.</p>
          </div>
          <div className="min-w-0 lg:col-span-7">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Monthly add ons</caption>
              <thead>
                <tr className="border-b border-border-strong">
                  <th scope="col" className="py-3 pr-4 caption-3 text-text-subtle">Add on</th>
                  <th scope="col" className="py-3 text-right caption-3 text-text-subtle">Per month</th>
                </tr>
              </thead>
              <tbody>
                {product.addOns.map((a) => (
                  <tr key={a.id} className="border-b border-border">
                    <th scope="row" className="py-3 pr-4 body-5 text-text">{a.name}</th>
                    <td className="py-3 text-right body-5 tabular-nums text-text">{money(a.usdPerMonth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
      <Faq title="Billing questions" items={billingFaq} />
    </>
  );
}
