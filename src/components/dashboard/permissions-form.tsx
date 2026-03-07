"use client";

import { PermissionsPicker } from "./permissions-picker";

type AvailableIntegration = {
  id: string;
  name: string;
  tools: { name: string; description: string }[];
};

interface PermissionsFormProps {
  mode: "all" | "specific";
  onModeChange: (mode: "all" | "specific") => void;
  permissions: Record<string, string[] | null>;
  onPermissionsChange: (permissions: Record<string, string[] | null>) => void;
  integrations: AvailableIntegration[];
  radioName?: string;
}

export function PermissionsForm({
  mode,
  onModeChange,
  permissions,
  onPermissionsChange,
  integrations,
  radioName = "perm-mode",
}: PermissionsFormProps) {
  return (
    <div className="rounded-lg border border-border bg-bg p-3">
      <div className="mb-2 flex gap-4">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="radio"
            name={radioName}
            checked={mode === "all"}
            onChange={() => onModeChange("all")}
            className="accent-accent"
          />
          All integrations
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="radio"
            name={radioName}
            checked={mode === "specific"}
            onChange={() => onModeChange("specific")}
            className="accent-accent"
          />
          Specific integrations
        </label>
      </div>
      {mode === "specific" && (
        <PermissionsPicker
          integrations={integrations}
          value={permissions}
          onChange={onPermissionsChange}
        />
      )}
    </div>
  );
}
