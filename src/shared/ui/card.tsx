import { cn } from "@/shared/ui/utils";

interface CardProps {
  className?: string;
  children: React.ReactNode;
  glow?: boolean;
}

export function Card({ className, children, glow }: CardProps) {
  return (
    <div
      className={cn(
        "glass-panel p-4 relative overflow-hidden",
        glow && "glass-panel-glow",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: CardProps) {
  return (
    <div className={cn("mb-3 pb-2 border-b border-obsidian-border flex items-center justify-between", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: CardProps) {
  return <h3 className={cn("text-[10px] font-bold uppercase tracking-[0.15em] text-white/70 font-mono", className)}>{children}</h3>;
}

export function CardContent({ className, children }: CardProps) {
  return <div className={cn("text-xs text-zinc-300", className)}>{children}</div>;
}

export function CardGlow({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        "glass-panel-glow p-4 relative overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  );
}
