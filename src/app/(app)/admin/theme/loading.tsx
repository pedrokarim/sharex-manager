export default function AdminThemeLoading() {
  return (
    <div className="flex flex-col gap-8" aria-hidden>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted" />
        </div>
      </div>
      <div className="h-10 w-64 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 10 }, (_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
