import { Skeleton } from "@/components/ui/states";

/** Skeleton shaped like the inbox ledger: page header, filter tabs, ruled rows and the receipt panel. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 border-b border-border pb-6">
        <Skeleton className="h-10 w-1/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-11 w-full" />
      <div className="flex gap-4 border-b border-border pb-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-16" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="flex flex-col rounded border border-border bg-surface lg:col-span-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="hidden lg:col-span-7 lg:block" />
      </div>
    </div>
  );
}
