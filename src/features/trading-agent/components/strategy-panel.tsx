"use client";

import { useEffect, useState, memo } from "react";
import { Sliders, Save, CheckCircle, Loader2 } from "lucide-react";

export const StrategyPanel = memo(function StrategyPanel() {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [persona, setPersona] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const fetchStrategy = async () => {
      try {
        const res = await fetch("/api/agent/strategy");
        if (!res.ok) throw new Error("Failed to fetch strategy");
        const data = await res.json();
        setPersona(data.persona || "");
        setInstructions(data.customInstructions || "");
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStrategy();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/agent/strategy", {
        method: "POST",
        body: JSON.stringify({ persona, customInstructions: instructions }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to save strategy");
      setStatusMsg({ type: "success", text: "STAGES MODIFIED // CORE RE-INJECTED" });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err) {
      setStatusMsg({ type: "error", text: "SAVE FAILED // CORE FAULT" });
    } finally {
      setSaving(false);
    }
  };

  // Derive profile bias from instructions
  const getStrategyBias = () => {
    const text = (persona + " " + instructions).toLowerCase();
    if (text.includes("aggressive") || text.includes("scalp") || text.includes("high-frequency") || text.includes("momentum")) {
      return { label: "AGGRESSIVE", color: "text-amber-500 border-amber-500/20 bg-amber-500/10" };
    }
    if (text.includes("conservative") || text.includes("preserve") || text.includes("safety") || text.includes("strict")) {
      return { label: "CONSERVATIVE", color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10" };
    }
    return { label: "BALANCED", color: "text-zinc-400 border-zinc-800 bg-zinc-900/40" };
  };

  const bias = getStrategyBias();

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden h-[48px] justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-zinc-550 animate-spin" />
          <span className="text-[10px] font-mono text-zinc-550 tracking-widest uppercase">
            Loading Cognitive Core...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden transition-all duration-200 ${
      isCollapsed ? "p-4 gap-0" : "p-5 gap-5"
    }`}>
      {/* Header */}
      <div 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`flex items-center justify-between flex-shrink-0 cursor-pointer group select-none ${
          isCollapsed ? "" : "border-b border-zinc-900/50 pb-3"
        }`}
      >
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-zinc-550 group-hover:text-zinc-350 transition-colors" />
          <span className="text-[10px] tracking-widest text-zinc-550 group-hover:text-zinc-350 font-bold uppercase transition-colors">
            Agent Customizer
          </span>
          <span className="text-[8px] font-mono text-zinc-650 ml-1.5 uppercase font-bold tracking-widest bg-zinc-950/60 border border-zinc-900 px-1 py-0.2 rounded group-hover:text-zinc-400 group-hover:border-zinc-800 transition-all">
            {isCollapsed ? "[EXPAND]" : "[COLLAPSE]"}
          </span>
        </div>
        <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded border font-mono tracking-wider ${bias.color}`}>
          {bias.label}
        </span>
      </div>

      {!isCollapsed && (
        <div className="flex flex-col gap-4 font-mono text-[11px] mt-1">
          {/* Persona Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">
              Agent Trading Persona
            </label>
            <textarea
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              rows={2}
              placeholder="e.g. Conservative quant trading analyst focusing on long-term trends..."
              className="w-full bg-zinc-950 border border-zinc-850 rounded p-2.5 text-zinc-200 focus:outline-none focus:border-zinc-750 transition-all font-sans leading-relaxed text-[11px] resize-none"
            />
          </div>

          {/* Instructions Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">
              Custom Strategy Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              placeholder="e.g. Respect strict RSI oversold limits. Buy only on oversold and MACD confirmations. Hold is always the preferred default decision."
              className="w-full bg-zinc-950 border border-zinc-850 rounded p-2.5 text-zinc-200 focus:outline-none focus:border-zinc-750 transition-all font-sans leading-relaxed text-[11px] resize-none"
            />
          </div>

          {/* Save Action */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-grow py-2.5 rounded border border-zinc-850 bg-zinc-900/50 hover:bg-zinc-800/80 hover:border-zinc-700 transition-all text-[10px] font-bold tracking-widest uppercase flex items-center justify-center gap-2 text-zinc-200 disabled:opacity-40 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  SAVING CORE...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  COMMIT STRATEGY
                </>
              )}
            </button>
          </div>

          {statusMsg && (
            <div className={`p-2.5 rounded text-[9px] font-mono font-bold tracking-wider text-center border animate-fade-in ${
              statusMsg.type === "success" 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                : "bg-rose-500/10 border-rose-500/20 text-rose-400"
            }`}>
              {statusMsg.type === "success" && <CheckCircle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
              {statusMsg.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
