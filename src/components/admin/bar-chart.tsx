interface BarChartProps {
  data: Array<{ label: string; value: number; errorValue?: number }>;
}

export function BarChart({ data }: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3 text-sm">
          <span className="w-20 shrink-0 text-right text-text-secondary">
            {d.label}
          </span>
          <div className="relative h-6 flex-1 rounded bg-bg-hover">
            <div
              className="absolute inset-y-0 left-0 rounded bg-accent/80"
              style={{ width: `${(d.value / max) * 100}%` }}
            />
            {d.errorValue != null && d.errorValue > 0 && (
              <div
                className="absolute inset-y-0 left-0 rounded bg-red-500/60"
                style={{ width: `${(d.errorValue / max) * 100}%` }}
              />
            )}
          </div>
          <span className="w-12 shrink-0 text-right tabular-nums">
            {d.value}
          </span>
        </div>
      ))}
    </div>
  );
}
