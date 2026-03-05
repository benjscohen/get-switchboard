import { Skeleton } from "@/components/ui/skeleton";

export default function McpServersLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-14" />
                </div>
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-4 w-16" />
              <div className="flex items-center gap-1">
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
