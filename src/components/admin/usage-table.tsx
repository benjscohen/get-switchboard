"use client";

interface UsageRow {
  id: string;
  userEmail: string | null;
  apiKeyPrefix: string | null;
  toolName: string | null;
  integrationId: string | null;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface UsageTableProps {
  logs: UsageRow[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function UsageTable({ logs, page, totalPages, onPageChange }: UsageTableProps) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="pb-2 pr-4 font-medium">Time</th>
              <th className="pb-2 pr-4 font-medium">User</th>
              <th className="pb-2 pr-4 font-medium">Key</th>
              <th className="pb-2 pr-4 font-medium">Tool</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-bg-hover">
                <td className="py-2 pr-4 whitespace-nowrap text-text-secondary">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="py-2 pr-4 max-w-40 truncate">
                  {log.userEmail ?? "—"}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">
                  {log.apiKeyPrefix ? `${log.apiKeyPrefix}...` : "—"}
                </td>
                <td className="py-2 pr-4">{log.toolName ?? "—"}</td>
                <td className="py-2 pr-4">
                  <span
                    className={
                      log.status === "success"
                        ? "text-green-500"
                        : log.status === "unauthorized"
                          ? "text-amber-600"
                          : "text-red-500"
                    }
                  >
                    {log.status}
                  </span>
                  {log.errorMessage && (
                    <span className="ml-1 text-xs text-text-tertiary" title={log.errorMessage}>
                      ({log.errorMessage.slice(0, 40)})
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 tabular-nums">
                  {log.durationMs != null ? `${log.durationMs}ms` : "—"}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-tertiary">
                  No logs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-text-secondary">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="rounded border border-border px-3 py-1 text-sm transition-colors hover:bg-bg-hover disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="rounded border border-border px-3 py-1 text-sm transition-colors hover:bg-bg-hover disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
