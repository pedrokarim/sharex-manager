export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary mx-auto"></div>
        <p className="text-sm text-muted-foreground">Loading theme editor...</p>
      </div>
    </div>
  );
}
