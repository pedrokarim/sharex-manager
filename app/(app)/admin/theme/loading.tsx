export default function AdminThemeLoading() {
  return (
    <div className="space-y-6">
      <div className="h-32 animate-pulse rounded-3xl border border-border/60 bg-muted/30" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <div className="h-[70vh] animate-pulse rounded-3xl border border-border/60 bg-muted/30" />
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-3xl border border-border/60 bg-muted/30" />
          <div className="h-56 animate-pulse rounded-3xl border border-border/60 bg-muted/30" />
        </div>
      </div>
    </div>
  );
}
