"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs compound components must be used within <Tabs>");
  return ctx;
}

export function Tabs({
  defaultTab,
  children,
  className,
}: {
  defaultTab: string;
  children: ReactNode;
  className?: string;
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  return (
    <TabsContext value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext>
  );
}

export function TabList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-1 rounded-lg bg-bg p-1",
        className
      )}
      role="tablist"
    >
      {children}
    </div>
  );
}

export function TabTrigger({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === id;
  return (
    <button
      role="tab"
      aria-selected={isActive}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
        isActive
          ? "bg-bg-card text-text-primary shadow-sm"
          : "text-text-tertiary hover:text-text-secondary",
        className
      )}
      onClick={() => setActiveTab(id)}
    >
      {children}
    </button>
  );
}

export function TabPanel({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { activeTab } = useTabsContext();
  if (activeTab !== id) return null;
  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  );
}
