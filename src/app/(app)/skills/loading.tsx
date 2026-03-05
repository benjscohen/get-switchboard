import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function SkillsLoading() {
  return (
    <Container className="py-10">
      <div className="mb-2 flex items-center justify-between">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="mb-8 h-4 w-96" />

      <Skeleton className="mb-3 h-4 w-24" />
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-3 w-full" />
              </div>
              <Skeleton className="h-8 w-14" />
            </div>
          </div>
        ))}
      </div>

      <Skeleton className="mb-3 h-4 w-24" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
