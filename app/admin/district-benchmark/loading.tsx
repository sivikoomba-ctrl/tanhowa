import { Skeleton } from "@/components/ui/skeleton";

export default function DistrictBenchmarkLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-3 w-64 mt-1" />
          </div>
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-[400px] rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[300px] rounded-xl" />)}
      </div>
    </div>
  );
}
