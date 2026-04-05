import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function SpecialDocumentsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <Skeleton className="h-10 w-full rounded-md" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-3 pb-3"><div className="flex items-center gap-3"><Skeleton className="w-10 h-10 rounded-lg" /><div className="flex-1"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/3 mt-1" /></div></div></CardContent></Card>
        ))}
      </div>
    </div>
  );
}
