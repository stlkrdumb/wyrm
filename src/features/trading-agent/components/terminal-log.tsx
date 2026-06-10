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
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "--:--:--";
  }
}

export function TerminalLog({ logs }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <Card className="h-[300px]">
      <CardHeader>
        <CardTitle>Agent Console</CardTitle>
        <span className="text-[9px] tracking-widest text-zinc-500 font-mono flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          LIVE
        </span>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          className="h-[220px] overflow-y-auto scrollbar-none font-mono text-[10px] leading-relaxed"
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
      </CardContent>
    </Card>
  );
}
