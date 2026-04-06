import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function CalendarLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </div>
      </div>
      <div className="flex gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-5 w-16 rounded-full" />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="w-9 h-9 rounded-lg" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="w-9 h-9 rounded-lg" />
      </div>
      <Card className="rounded-2xl">
        <CardContent className="p-3">
          <div className="grid grid-cols-7 gap-px mb-1">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} className="h-6 rounded" />
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-[80px] rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
