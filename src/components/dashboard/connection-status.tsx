import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <Card hover={false}>
      <h2 className="mb-3 text-sm font-medium text-text-secondary">
        Integrations
      </h2>
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg">
          <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
            <path
              d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"
              fill="#4285F4"
            />
            <path
              d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"
              fill="#34A853"
            />
            <path
              d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"
              fill="#FBBC05"
            />
            <path
              d="M8.98 3.58c1.32 0 2.5.44 3.44 1.35l2.58-2.59C13.46.89 11.14 0 8.98 0A8 8 0 001.83 5.41L4.5 7.48a4.77 4.77 0 014.48-3.9z"
              fill="#EA4335"
            />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Google Calendar</p>
        </div>
        <Badge variant={connected ? "accent" : "default"}>
          {connected ? "Connected" : "Not connected"}
        </Badge>
      </div>
    </Card>
  );
}
