import { cn } from "@/shared/ui/utils";

export interface BadgeProps {
  variant?: "success" | "danger" | "warning" | "neutral" | "info";
  children: React.ReactNode;
}

const variants = {
  success: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  danger: "bg-red-500/20 text-red-400 border-red-500/30",
  warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  neutral: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export function Badge({ variant = "neutral", children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border",
        variants[variant]
      )}
    >
      {children}
    </span>
  );
}
