import Link from "next/link";
import { notFound } from "next/navigation";
import { FormTabs } from "@/components/app/forms/form-tabs";
import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { Form } from "@/lib/forms/types";
import { SUBMISSION_EVENTS, listFormWebhooks, webhooksAllowed } from "@/lib/webhooks/submissions";
import { FormWebhooksClient } from "./webhooks-client";

export const metadata = { title: "Webhooks" };
export const dynamic = "force-dynamic";

export default async function FormWebhooksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg({ page: true });
  const db = await getDb();
  const form = await db.docs<Form>("forms").get(id);
  if (!form || form.orgId !== ctx.org.id) notFound();
  const endpoints = (await listFormWebhooks(db, ctx.org.id, id)).map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }));
  return (
    <>
      <PageHeader title={form.name} description={<><Link href="/app/forms" className="underline underline-offset-4">All forms</Link> · signed JSON to your server when a submission changes</>} />
      <FormTabs id={form._id} active="webhooks" />
      <FormWebhooksClient formId={form._id} canManage={can(ctx.role, "webhook", "manage")} allowed={await webhooksAllowed(db, ctx.org.id)} events={[...SUBMISSION_EVENTS]} initial={endpoints} />
    </>
  );
}
