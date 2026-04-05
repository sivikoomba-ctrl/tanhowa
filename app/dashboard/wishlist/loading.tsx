import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function WishlistLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><Skeleton className="w-10 h-10 rounded-xl" /><Skeleton className="h-7 w-32" /></div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-4"><div className="space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-1/3" /></div></CardContent></Card>
        ))}
      </div>
    </div>
  );
}
