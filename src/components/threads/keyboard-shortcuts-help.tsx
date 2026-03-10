"use client";

interface KeyboardShortcutsHelpProps {
  onClose: () => void;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[24px] items-center justify-center rounded border border-border bg-bg-hover px-1.5 py-0.5 text-xs font-medium text-text-secondary">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-text-secondary">{label}</span>
      <div className="flex items-center gap-1">
        {keys.split(" ").map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </div>
    </div>
  );
}

export function KeyboardShortcutsHelp({ onClose }: KeyboardShortcutsHelpProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Navigation
            </h3>
            <ShortcutRow keys="j ↓" label="Next thread" />
            <ShortcutRow keys="k ↑" label="Previous thread" />
            <ShortcutRow keys="/" label="Search" />
          </div>

          <div>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Actions
            </h3>
            <ShortcutRow keys="c" label="Compose new thread" />
            <ShortcutRow keys="r" label="Reply" />
            <ShortcutRow keys="e" label="Mark done" />
            <ShortcutRow keys="u" label="Undo done / Reopen" />
            <ShortcutRow keys="s" label="Stop thread" />
          </div>

          <div>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-text-tertiary">
              General
            </h3>
            <ShortcutRow keys="?" label="Show shortcuts" />
            <ShortcutRow keys="Esc" label="Close / Cancel" />
          </div>
        </div>
      </div>
    </div>
  );
}
