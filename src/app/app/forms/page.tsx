import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { CreateForm } from "@/components/app/forms/create-form";
import { Badge, EmptyState } from "@/components/ui/states";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { Form, Submission } from "@/lib/forms/types";
import { appUrl } from "@/lib/env";

export const metadata = { title: "Forms" };
export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const ctx = await requireOrg({ page: true });
  const db = await getDb();
  const forms = await db.docs<Form>("forms").find({ orgId: ctx.org.id }, { sort: { createdAt: -1 }, limit: 200 });
  const counts = await Promise.all(forms.map((f) => db.docs<Submission>("submissions").count({ formId: f._id, status: { $ne: "quarantined" } })));
  return (
    <>
      <PageHeader title="Forms" description="One form is one endpoint. Create as many as you need, on any plan." />
      <div className="flex flex-col gap-6">
        {can(ctx.role, "data", "write") ? <CreateForm /> : null}
        {forms.length ? (
          <ul className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
            {forms.map((f, i) => (
              <li key={f._id} className="border-b border-border last:border-b-0">
                <Link href={`/app/forms/${f._id}`} className="flex min-h-11 flex-col gap-1 p-4 transition-colors duration-300 hover:bg-surface-raised focus-visible:focus-ring sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex min-w-0 flex-col">
                    <span className="title-3 truncate text-text">{f.name}</span>
                    <span className="truncate font-mono text-xs text-text-muted">{appUrl()}/f/{f.key}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="caption-2 text-text-subtle">{counts[i]} submissions</span>
                    <Badge tone={f.status === "active" ? "success" : "warning"}>{f.status === "active" ? "Active" : f.status === "paused" ? "Paused" : "Suspended"}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No forms yet" body="Name your first form above. You get its endpoint URL and an install snippet for your stack straight away." />
        )}
      </div>
    </>
  );
}
