import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function SuggestionsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="border-l-4 border-l-muted">
            <CardContent className="pt-4"><div className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-8 w-10" /></div></CardContent>
          </Card>
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}><CardContent className="pt-4"><div className="flex gap-3"><Skeleton className="w-10 h-10 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-24" /></div></div></CardContent></Card>
      ))}
    </div>
  );
}
