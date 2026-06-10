import { cn } from "@/shared/ui/utils";

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        "rounded border border-zinc-800/80 bg-zinc-950/60 p-4 shadow-lg shadow-black/40 relative overflow-hidden transition-all duration-300 hover:border-zinc-700/80 hover:shadow-xl hover:shadow-black/50 z-0",
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/30 to-transparent pointer-events-none" />
      {children}
    </div>
  );
}

export function CardGlow({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        "rounded border border-cyan-500/30 bg-zinc-950/60 p-4 shadow-lg shadow-cyan-900/20 relative overflow-hidden transition-all duration-300 hover:border-cyan-500/50 hover:shadow-xl hover:shadow-cyan-900/30 z-10",
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-900/10 to-transparent pointer-events-none" />
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: CardProps) {
  return (
    <div className={cn("relative mb-3 pb-2 border-b border-zinc-800/60 flex items-center justify-between", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: CardProps) {
  return <h3 className={cn("text-[10px] font-bold uppercase tracking-[0.15em] text-cyan-500/70", className)}>{children}</h3>;
}

export function CardContent({ className, children }: CardProps) {
  return <div className={cn("relative text-xs text-zinc-300", className)}>{children}</div>;
}
