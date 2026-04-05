import { Skeleton } from "@/components/ui/skeleton";

export default function PaymentStatusLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><Skeleton className="w-10 h-10 rounded-xl" /><Skeleton className="h-7 w-40" /></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-10 w-full max-w-md rounded-md" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    </div>
  );
}
