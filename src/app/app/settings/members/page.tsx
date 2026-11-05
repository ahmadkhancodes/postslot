import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { seatLimit } from "@/lib/billing/seats";
import { getDb } from "@/lib/db";
import { MembersClient } from "./members-client";

export const metadata = { title: "Members" };

export default async function MembersPage() {
  const ctx = await requireOrg({ page: true });
  const seats = await seatLimit(await getDb(), ctx.org.id);
  return (
    <>
      <PageHeader title="Members" description={`People who can access ${ctx.org.name}, and what they can do. Your plan includes ${seats} seat${seats === 1 ? "" : "s"}; an invitation cannot be accepted once they are all used.`} />
      <MembersClient
        orgId={ctx.org.id}
        meId={ctx.user.id}
        canInvite={can(ctx.role, "invitation", "create")}
        canCancelInvite={can(ctx.role, "invitation", "cancel")}
        canUpdate={can(ctx.role, "member", "update")}
        canRemove={can(ctx.role, "member", "delete")}
      />
    </>
  );
}
