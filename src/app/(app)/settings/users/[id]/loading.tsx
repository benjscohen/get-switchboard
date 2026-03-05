import { Skeleton } from "@/components/ui/skeleton";

export default function UserDetailLoading() {
  return (
    <div className="space-y-8">
      {/* Back link + header */}
      <div>
        <Skeleton className="mb-4 h-4 w-28" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-5 w-14" />
        </div>
      </div>

      {/* Role card */}
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <Skeleton className="mb-3 h-4 w-12" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-16" />
        </div>
      </div>

      {/* Organization card */}
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="h-4 w-36" />
      </div>

      {/* Permissions card */}
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <Skeleton className="mb-3 h-4 w-36" />
        <Skeleton className="h-20 w-full" />
      </div>

      {/* API Keys card */}
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <Skeleton className="mb-3 h-4 w-20" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
