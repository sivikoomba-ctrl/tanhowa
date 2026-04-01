import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function DocumentsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="space-y-1"><Skeleton className="h-7 w-40" /><Skeleton className="h-3 w-24" /></div>
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <Card><CardContent className="pt-4"><div className="flex gap-3"><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 w-[200px]" /></div></CardContent></Card>
      <div className="flex gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-20 rounded-full" />)}</div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-5"><div className="flex gap-3"><Skeleton className="w-11 h-11 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-full" /><div className="flex gap-1.5"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-12 rounded-full" /></div></div></div></CardContent></Card>
        ))}
      </div>
    </div>
  );
}
