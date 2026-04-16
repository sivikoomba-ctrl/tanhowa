import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function GroupChatLoading() {
  return (
    <Card className="h-[calc(100vh-8rem)] overflow-hidden rounded-2xl">
      <div className="flex h-full">
        {/* Channel list skeleton */}
        <div className="w-80 lg:w-96 border-r flex flex-col">
          <div className="p-4 space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex-1 space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b">
                <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                  <Skeleton className="h-3 w-44" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Chat placeholder skeleton */}
        <div className="flex-1 hidden md:flex flex-col items-center justify-center">
          <Skeleton className="w-12 h-12 rounded-full mb-3" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>
    </Card>
  );
}
