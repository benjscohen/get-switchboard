import { useEffect } from "react";

export function useHotkeys(
  keyMap: Record<string, (e: KeyboardEvent) => void>,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Allow Escape everywhere; suppress others in input fields
      if (e.key !== "Escape") {
        const el = document.activeElement;
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLSelectElement ||
          (el instanceof HTMLElement && el.isContentEditable)
        ) {
          return;
        }
      }

      // Ignore when modifier keys are held (except shift for ?)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key === "?" ? "?" : e.key.toLowerCase();
      const handler = keyMap[key];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [keyMap, enabled]);
}
