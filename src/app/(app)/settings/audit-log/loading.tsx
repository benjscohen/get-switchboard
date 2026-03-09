export default function AuditLogLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-36 rounded-lg bg-bg-hover animate-pulse" />
        ))}
      </div>
      <div className="rounded-xl border border-border bg-bg-card p-4">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-bg-hover animate-pulse" />
              <div className="h-4 w-40 rounded bg-bg-hover animate-pulse" />
              <div className="h-4 w-32 rounded bg-bg-hover animate-pulse" />
              <div className="ml-auto h-4 w-20 rounded bg-bg-hover animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
