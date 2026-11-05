import Link from "next/link";
import { notFound } from "next/navigation";
import { FormManager } from "@/components/app/forms/form-manager";
import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/env";
import type { Form, Recipient } from "@/lib/forms/types";
import { snippetsFor } from "@/lib/onboarding/snippets";

export const metadata = { title: "Form" };
export const dynamic = "force-dynamic";

export default async function FormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg({ page: true });
  const db = await getDb();
  const form = await db.docs<Form>("forms").get(id);
  if (!form || form.orgId !== ctx.org.id) notFound();
  const recipients = (await db.docs<Recipient>("recipients").find({ _id: { $in: form.recipientIds } })).map(({ verifyTokenHash: _h, ...r }) => ({
    id: r._id, email: r.email, verified: !!r.verifiedAt, bounced: r.bouncedAt ? (r.bounceDetail ?? "rejected") : null,
  }));
  const endpoint = `${appUrl()}/f/${form.key}`;
  return (
    <>
      <PageHeader
        title={form.name}
        description={<><Link href="/app/forms" className="underline underline-offset-4">All forms</Link> · <Link href={`/app?form=${form._id}`} className="underline underline-offset-4">Open inbox</Link></>}
      />
      <FormManager
        canWrite={can(ctx.role, "data", "write")}
        form={{ id: form._id, name: form.name, status: form.status, redirectUrl: form.redirectUrl ?? "", allowedOrigins: form.allowedOrigins, altchaEnabled: form.altchaEnabled, spamMode: form.spamMode, blockedCount: form.blockedCount, subjectTemplate: form.subjectTemplate }}
        endpoint={endpoint}
        recipients={recipients}
        snippets={snippetsFor(endpoint, appUrl())}
      />
    </>
  );
}
