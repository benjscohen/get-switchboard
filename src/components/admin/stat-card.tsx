interface StatCardProps {
  label: string;
  value: string | number;
  detail?: string;
}

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-6">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {detail && (
        <p className="mt-1 text-xs text-text-tertiary">{detail}</p>
      )}
    </div>
  );
}
