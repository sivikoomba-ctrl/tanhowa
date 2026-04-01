import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function ProfileLoading() {
  return (
    <div className="max-w-3xl space-y-6">
      <Skeleton className="h-8 w-32" />
      {/* Hero card */}
      <Card className="overflow-hidden">
        <Skeleton className="h-20 w-full" />
        <CardContent className="pt-0 pb-5">
          <div className="flex items-end gap-4 -mt-10">
            <Skeleton className="w-24 h-24 rounded-full border-4 border-background" />
            <div className="flex-1 space-y-2 pb-1">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-40 rounded-full" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Section cards */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
