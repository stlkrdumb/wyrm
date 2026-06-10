"use client";

import { cn } from "@/shared/ui/utils";

interface ProgressProps {
  value: number;
  max?: number;
  variant?: "emerald" | "cyan" | "rose" | "zinc";
  className?: string;
  barClassName?: string;
}

const barVariants = {
  emerald: "bg-emerald-500",
  cyan: "bg-cyan-500",
  rose: "bg-rose-500",
  zinc: "bg-zinc-500",
};

export function Progress({ value, max = 1, variant = "zinc", className, barClassName }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn("h-1.5 rounded-full bg-zinc-800/60 overflow-hidden", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500 ease-out",
          barVariants[variant],
          barClassName
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
