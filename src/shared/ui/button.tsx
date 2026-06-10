import { cn } from "@/shared/ui/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "cyan" | "emerald";
  size?: "sm" | "md" | "lg";
}

const variants = {
  primary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700",
  secondary: "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800",
  ghost: "hover:bg-zinc-800 text-zinc-400",
  danger: "bg-rose-600 hover:bg-rose-500 text-white border border-rose-500",
  cyan: "bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-500",
  emerald: "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500",
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
        "inline-flex items-center justify-center rounded-md font-semibold tracking-wider uppercase transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
