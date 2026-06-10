import { cn } from "@/shared/ui/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "amber" | "emerald";
  size?: "sm" | "md" | "lg";
}

const variants = {
  primary: "terminal-btn terminal-btn-primary",
  secondary: "terminal-btn",
  ghost: "terminal-btn border-transparent",
  danger: "terminal-btn terminal-btn-danger",
  amber: "terminal-btn terminal-btn-primary",
  emerald: "terminal-btn terminal-btn-primary",
};

const sizes = {
  sm: "px-2 py-1 text-[10px]",
  md: "px-3 py-1.5 text-xs",
  lg: "px-4 py-2 text-sm",
};

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-bold tracking-wider uppercase transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/30 disabled:pointer-events-none disabled:opacity-30",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
