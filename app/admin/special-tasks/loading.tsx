import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function SpecialTasksLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <Skeleton className="h-10 w-full max-w-sm rounded-md" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-4"><div className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-1/4" /></div></CardContent></Card>
        ))}
      </div>
    </div>
  );
}
