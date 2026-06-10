import { cn } from "@/shared/ui/utils";

interface TabsProps {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn("flex items-center gap-0 border-b border-obsidian-border", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "px-3 py-2 text-[10px] font-bold tracking-widest uppercase transition-all duration-150 cursor-pointer relative",
            active === tab.key
              ? "text-white"
              : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          {tab.label}
          {active === tab.key && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/70 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
