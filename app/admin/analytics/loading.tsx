import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><Skeleton className="w-10 h-10 rounded-xl" /><div><Skeleton className="h-7 w-36" /><Skeleton className="h-3 w-52 mt-1" /></div></div>
        <div className="flex gap-1">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-20 rounded-md" />)}</div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-[320px] rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-[300px] rounded-xl lg:col-span-2" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    </div>
  );
}
