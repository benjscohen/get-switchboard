import { AgentUsageDashboard } from "@/components/admin/agent-usage-dashboard";

export default function SettingsAgentUsagePage() {
  return (
    <div>
      <p className="mb-6 text-text-secondary">
        Monitor agent sessions, message volume, token consumption, and user activity.
      </p>
      <AgentUsageDashboard />
    </div>
  );
}
