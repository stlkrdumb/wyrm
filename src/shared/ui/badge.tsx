import { cn } from "@/shared/ui/utils";

export interface BadgeProps {
  variant?: "success" | "danger" | "warning" | "neutral" | "info" | "amber";
  className?: string;
  children: React.ReactNode;
}

const variants = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  danger: "bg-rose-500/15 text-rose-400 border-rose-500/25",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  neutral: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  info: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  amber: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

export function Badge({ variant = "neutral", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase border transition-colors",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
