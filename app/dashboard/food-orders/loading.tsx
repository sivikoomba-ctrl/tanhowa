export default function FoodOrdersLoading() {
  return (
    <div className="space-y-6 p-6 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 bg-muted rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
