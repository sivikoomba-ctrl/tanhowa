export default function FAQLoading() {
  return (
    <div className="space-y-6 p-6 animate-pulse">
      <div className="h-8 w-64 bg-muted rounded" />
      <div className="h-10 w-full bg-muted rounded-xl" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}
