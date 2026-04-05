import { Skeleton } from "@/components/ui/skeleton";

export default function DistrictDuesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><Skeleton className="w-10 h-10 rounded-xl" /><Skeleton className="h-7 w-36" /></div>
      <div className="flex gap-2"><Skeleton className="h-10 w-40" /><Skeleton className="h-10 w-40" /></div>
      <Skeleton className="h-[400px] rounded-xl" />
    </div>
  );
}
