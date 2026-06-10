"use client";

import { cn } from "@/shared/ui/utils";

interface ProgressProps {
  value: number;
  max?: number;
  variant?: "emerald" | "amber" | "rose" | "zinc";
  className?: string;
  barClassName?: string;
}

const barVariants = {
  emerald: "bg-phosphor-green",
  amber: "bg-phosphor",
  rose: "bg-phosphor-red",
  zinc: "bg-phosphor-dim",
};

export function Progress({ value, max = 1, variant = "zinc", className, barClassName }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn("h-[2px] bg-amber-900/20 overflow-hidden", className)}>
      <div
        className={cn(
          "h-full transition-all duration-500 ease-out",
          barVariants[variant],
          barClassName
        )}
        style={{ width: `${pct}%`, boxShadow: variant === 'amber' || variant === 'emerald' ? '0 0 4px rgba(255,176,0,0.3)' : 'none' }}
      />
    </div>
  );
}
