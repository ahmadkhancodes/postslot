"use client";
import { useState } from "react";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { product, plans, type Interval, type Plan, type PlanPrice } from "@/config/product";
import { buttonClass } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/components/ui/cn";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/** The price shown for the chosen interval; a plan with only one interval shows that one. */
function priceFor(plan: Plan, interval: Interval): PlanPrice | null {
  if (plan.prices.length === 0) return null;
  return plan.prices.find((p) => p.interval === interval) ?? plan.prices[0] ?? null;
}

/** Whole-percent saving of paying yearly, for every plan that sells both intervals. */
function annualSavings(): { min: number; max: number } | null {
  const pct = plans.flatMap((p) => {
    const m = p.prices.find((x) => x.interval === "month");
    const y = p.prices.find((x) => x.interval === "year");
    return m && y ? [Math.round((1 - y.usd / (m.usd * 12)) * 100)] : [];
  });
  return pct.length ? { min: Math.min(...pct), max: Math.max(...pct) } : null;
}

/** Monthly premium over annual for Pro, in dollars to one decimal (brief: "+$1.30 a month versus annual"). */
function proMonthlyPremium(): string | null {
  const pro = plans.find((p) => p.id === "pro");
  const m = pro?.prices.find((x) => x.interval === "month");
  const y = pro?.prices.find((x) => x.interval === "year");
  return m && y ? ((m.usd - y.usd / 12) / 100).toFixed(1) : null;
}

const RISK_FREE = "No card, no trial clock. The Free plan is the trial.";
const RISK_PAID = "Cancel anytime. Export your data.";

export function PricingTable({ id = "pricing", title }: { id?: string; title?: string }) {
  const [interval, setBilling] = useState<Interval>(product.defaultInterval);
  const saving = annualSavings();
  const savingText = saving ? (saving.min === saving.max ? `${saving.max}%` : `${saving.min}% to ${saving.max}%`) : null;
  const options: { id: Interval; label: string }[] = [
    { id: "month", label: "Monthly" },
    { id: "year", label: "Annual" },
  ];

  return (
    <div id={id}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        {title ? <h2 id={`${id}-title`} className="heading-4 md:heading-2 text-text">{title}</h2> : <span />}
        {saving ? (
          <div className="flex flex-col gap-2 md:items-end">
            <div role="group" aria-label="Billing interval" className="inline-flex w-fit rounded-sm border border-border-strong bg-surface p-0.5">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={interval === o.id}
                  onClick={() => setBilling(o.id)}
                  className={cn(
                    "min-h-11 rounded-xs px-4 button-sm transition-colors duration-300 ease-out-kit focus-visible:focus-ring",
                    interval === o.id ? "bg-text text-text-inverse" : "text-text-subtle hover:text-text",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="caption-2 text-text-subtle">
              Annual saves {savingText} on plans sold both ways. Pro monthly costs about ${proMonthlyPremium()}0 a month more than annual.
            </p>
          </div>
        ) : null}
      </div>

      <ul className="mt-8 grid overflow-hidden rounded border border-border bg-border gap-px md:mt-12 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const price = priceFor(plan, interval);
          const free = !price;
          const href = `/sign-in?plan=${plan.id}&interval=${price?.interval ?? interval}`;
          return (
            <li
              key={plan.id}
              className={cn(
                "relative grid grid-rows-[auto_auto_auto_auto_1fr] p-6 lg:row-span-5 lg:grid-rows-subgrid",
                plan.featured ? "bg-surface-receipt" : "bg-surface",
              )}
            >
              {plan.featured ? <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-accent" /> : null}
              <div className="pb-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="heading-6 text-text">{plan.name}</h3>
                  {plan.featured ? <span className="label-mono text-accent">Most popular</span> : null}
                </div>
                <p className="body-6 mt-1 text-text-subtle">{plan.tagline}</p>
              </div>
              <p className="flex items-baseline gap-1 pb-6">
                <span className="heading-2 tabular-nums text-text">{free ? "$0" : money(price.usd)}</span>
                <span className="body-6 text-text-subtle">{free ? "forever" : `per ${price.interval}`}</span>
              </p>
              <div className="pb-3">
                <Link href={href} className={cn(buttonClass(plan.featured ? "primary" : "secondary", "md"), "w-full")}>{plan.cta}</Link>
              </div>
              <p className="caption-2 pb-6 text-text-subtle">{free ? RISK_FREE : RISK_PAID}</p>
              <ul className="flex flex-col gap-2 border-t border-dashed border-border-strong pt-6">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 body-6 text-text">
                    <Check size={16} weight="regular" aria-hidden className="mt-0.5 shrink-0 text-accent" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
