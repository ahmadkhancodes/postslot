import Link from "next/link";
import { notFound } from "next/navigation";
import { FormTabs } from "@/components/app/forms/form-tabs";
import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { Form } from "@/lib/forms/types";
import { TemplatesClient } from "./templates-client";

export const metadata = { title: "Email template" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg({ page: true });
  const form = await (await getDb()).docs<Form>("forms").get(id);
  if (!form || form.orgId !== ctx.org.id) notFound();
  return (
    <>
      <PageHeader title={form.name} description={<><Link href="/app/forms" className="underline underline-offset-4">All forms</Link> · the email you receive for each submission</>} />
      <FormTabs id={form._id} active="templates" />
      <TemplatesClient formId={form._id} canWrite={can(ctx.role, "data", "write")} initial={{ template: form.template ?? "default", subject: form.subjectTemplate }} />
    </>
  );
}
