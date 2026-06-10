import { cn } from "@/shared/ui/utils";

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        "terminal-card terminal-border-hover p-4 transition-all duration-300",
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] to-transparent pointer-events-none" />
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: CardProps) {
  return (
    <div className={cn("relative mb-3 pb-2 border-b border-amber-900/20 flex items-center justify-between", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: CardProps) {
  return (
    <h3 className={cn("text-[10px] font-bold uppercase tracking-[0.2em] text-phosphor phosphor-glow", className)}>
      {children}
    </h3>
  );
}

export function CardContent({ className, children }: CardProps) {
  return <div className={cn("relative text-xs text-amber-100/70", className)}>{children}</div>;
}
