import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function TeamsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-24" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="border-l-4 border-l-muted">
            <CardContent className="pt-4"><div className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-8 w-10" /></div></CardContent>
          </Card>
        ))}
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-28 rounded-xl" />)}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-4"><div className="flex gap-3"><Skeleton className="w-14 h-14 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-2/3" /></div></div></CardContent></Card>
        ))}
      </div>
    </div>
  );
}
