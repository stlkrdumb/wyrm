import { cn } from "@/shared/ui/utils";

export interface BadgeProps {
  variant?: "success" | "danger" | "warning" | "neutral" | "info" | "amber";
  className?: string;
  children: React.ReactNode;
}

const variants = {
  success: "terminal-badge-green",
  danger: "terminal-badge-red",
  warning: "terminal-badge-amber",
  neutral: "terminal-badge text-phosphor-muted",
  info: "terminal-badge border-blue-500/30 bg-blue-500/5 text-blue-400/70",
  amber: "terminal-badge-amber",
};

export function Badge({ variant = "neutral", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 text-[8px] font-bold tracking-widest uppercase border",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
