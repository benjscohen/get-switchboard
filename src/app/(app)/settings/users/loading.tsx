import { Skeleton } from "@/components/ui/skeleton";

export default function UsersLoading() {
  return (
    <div className="space-y-6">
      {/* Add user section */}
      <section>
        <Skeleton className="mb-3 h-6 w-20" />
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <div className="flex gap-3">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
      </section>
      {/* Users table section */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
