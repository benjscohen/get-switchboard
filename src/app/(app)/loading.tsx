import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <Container className="py-10">
      <Skeleton className="mb-8 h-8 w-32" />
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    </Container>
  );
}
