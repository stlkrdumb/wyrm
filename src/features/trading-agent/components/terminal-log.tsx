"use client";

import { useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface Props {
  logs: LogEntry[];
  isTabMode?: boolean;
}

const levelColor: Record<string, string> = {
  info: "text-zinc-500",
  action: "text-emerald-400",
  warning: "text-white",
  error: "text-rose-400",
};

const levelTag: Record<string, string> = {
  info: "INF",
  action: "ACT",
  warning: "WRN",
  error: "ERR",
};

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch {
    return "--:--:--";
  }
}

export function TerminalLog({ logs, isTabMode }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const scrollContent = (heightClass: string) => (
    <div
      ref={scrollRef}
      className={`${heightClass} overflow-y-auto scrollbar-none font-mono text-[12px] leading-relaxed`}
    >
      {logs.length === 0 ? (
        <div className="text-zinc-600 py-8 text-center tracking-wider uppercase">
          Awaiting agent activity...
        </div>
      ) : (
        logs.map((log, i) => (
          <div key={i} className="flex gap-2 py-0.5">
            <span className="text-zinc-600 tabular-nums flex-shrink-0">
              {formatTime(log.timestamp)}
            </span>
            <span className={`${levelColor[log.level] || "text-zinc-500"} font-bold flex-shrink-0 w-6`}>
              {levelTag[log.level] || "INF"}
            </span>
            <span className={`${levelColor[log.level] || "text-zinc-400"} break-words`}>
              {log.message}
            </span>
          </div>
        ))
      )}
    </div>
  );

  if (isTabMode) return <div className="flex flex-col flex-1 min-h-0">{scrollContent("flex-grow")}</div>;

  return (
    <Card className="h-[200px] !border-transparent">
      <CardHeader className="!border-transparent">
        <CardTitle>Agent Console</CardTitle>
        <span className="text-[11px] tracking-widest text-zinc-500 font-mono flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          LIVE
        </span>
      </CardHeader>
      <CardContent>
        {scrollContent("h-[120px]")}
      </CardContent>
    </Card>
  );
}
