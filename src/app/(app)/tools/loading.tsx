import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <Container className="py-10">
      <Skeleton className="mb-8 h-8 w-24" />
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </Container>
  );
}
