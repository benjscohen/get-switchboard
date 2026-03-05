import { Skeleton } from "@/components/ui/skeleton";

export default function TeamsLoading() {
  return (
    <div className="space-y-6">
      {/* Create team card */}
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <Skeleton className="mb-4 h-4 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      {/* Teams list card */}
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <Skeleton className="mb-4 h-4 w-20" />
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
