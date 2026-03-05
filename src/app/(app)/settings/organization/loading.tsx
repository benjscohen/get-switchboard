import { Skeleton } from "@/components/ui/skeleton";

export default function OrganizationLoading() {
  return (
    <div className="space-y-6">
      {/* Org name card */}
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <Skeleton className="mb-4 h-4 w-36" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-16" />
        </div>
        <Skeleton className="mt-2 h-3 w-24" />
      </div>
      {/* Domains card */}
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <Skeleton className="mb-4 h-4 w-28" />
        <Skeleton className="mb-3 h-3 w-80" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
      {/* Integrations card */}
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <Skeleton className="mb-4 h-4 w-24" />
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
