import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function ContributionsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><Skeleton className="w-10 h-10 rounded-xl" /><Skeleton className="h-7 w-40" /></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-3 pb-3"><div className="flex items-center gap-3"><Skeleton className="w-8 h-8 rounded-full" /><div className="flex-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2 mt-1" /></div></div></CardContent></Card>
        ))}
      </div>
    </div>
  );
}
