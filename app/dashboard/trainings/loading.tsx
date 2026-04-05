import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function TrainingsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div><Skeleton className="h-7 w-32" /><Skeleton className="h-3 w-48 mt-1" /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-4 pb-4"><div className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-1/2" /></div></CardContent></Card>
        ))}
      </div>
    </div>
  );
}
