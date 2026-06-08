import { cn } from "@/shared/ui/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded border border-emerald-950 bg-black/90 p-4 shadow-xl shadow-black relative overflow-hidden",
        className
      )}
    >
      {/* Corner aesthetic highlights */}
      <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-emerald-500/30" />
      <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t border-r border-emerald-500/30" />
      <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-emerald-500/30" />
      <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-emerald-500/30" />
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("mb-3 pb-2 border-b border-emerald-950/60 flex items-center justify-between", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h3 className={cn("text-xs font-mono font-bold uppercase tracking-widest text-emerald-500/80", className)}>{children}</h3>;
}

export function CardContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("font-mono text-zinc-300", className)}>{children}</div>;
}
