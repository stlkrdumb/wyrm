"use client";

import { useEffect, useState, memo } from "react";
import { Sliders, Save, CheckCircle, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from "@/shared/ui";
import { apiFetch } from "@/shared/utils/api-fetch";

const STRATEGY_PRESETS = [
  {
    name: "CONSERVATIVE",
    persona: "Conservative quantitative analyst prioritizing capital preservation and compounding.",
    instructions: "Trade conservatively. Always favor 'hold' unless conviction is very high. Wait for strong oversold indicators (1h RSI < 30) and Bollinger Band lower border breaks. Limit trade sizes and take profits early.",
    threshold: 5,
  },
  {
    name: "BALANCED",
    persona: "Balanced macro trend strategist seeking medium-term swings while maintaining risk guardrails.",
    instructions: "Execute a balanced profile. Buy support zones on 1-hour chart confirmations and take profits at daily resistance levels. Distribute sizes evenly. Do not enter trades during high-volatility spikes.",
    threshold: 8,
  },
  {
    name: "AGGRESSIVE",
    persona: "High-frequency momentum trader looking to scalp quick micro-trends in volatile conditions.",
    instructions: "Look for quick momentum scalping on 5m chart trend changes. Enter trades on RSI breakouts above 55 or below 45. Target high-volatility moves. Accept higher drawdown limits to capture larger swings.",
    threshold: 12,
  },
];

export const StrategyPanel = memo(function StrategyPanel() {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [persona, setPersona] = useState("");
  const [instructions, setInstructions] = useState("");
  const [threshold, setThreshold] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const fetchStrategy = async () => {
      try {
        const res = await apiFetch("/api/agent/strategy");
        if (!res.ok) throw new Error("Failed to fetch strategy");
        const data = await res.json();
        setPersona(data.persona || "");
        setInstructions(data.customInstructions || "");
        if (data.circuitBreakerThresholdPct != null) setThreshold(data.circuitBreakerThresholdPct);
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
      const res = await apiFetch("/api/agent/strategy", {
        method: "POST",
        body: JSON.stringify({ persona, customInstructions: instructions, circuitBreakerThresholdPct: threshold }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to save strategy");
      setStatusMsg({ type: "success", text: "STAGES MODIFIED // CORE RE-INJECTED" });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch {
      setStatusMsg({ type: "error", text: "SAVE FAILED // CORE FAULT" });
    } finally {
      setSaving(false);
    }
  };

  const getStrategyBias = () => {
    const text = (persona + " " + instructions).toLowerCase();
    if (text.includes("aggressive") || text.includes("scalp") || text.includes("high-frequency") || text.includes("momentum")) return "AGGRESSIVE";
    if (text.includes("conservative") || text.includes("preserve") || text.includes("safety") || text.includes("strict")) return "CONSERVATIVE";
    return "BALANCED";
  };

  const bias = getStrategyBias();
  const THRESHOLD_PRESETS = [2, 3, 5, 8, 10, 12, 15, 20];

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
            <CardTitle>Agent Customizer</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <span className="text-[12px] font-mono text-zinc-500 tracking-widest uppercase">Loading Cognitive Core...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <div onClick={() => setIsCollapsed(!isCollapsed)} className="cursor-pointer select-none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-zinc-500" />
            <CardTitle>Agent Customizer</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={bias === "AGGRESSIVE" ? "warning" : bias === "CONSERVATIVE" ? "success" : "neutral"}>
              {bias}
            </Badge>
            <span className="text-[10px] font-mono text-zinc-600 border border-zinc-800 px-1.5 py-0.2 rounded tracking-wider">
              DD {threshold}%
            </span>
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              {isCollapsed ? "[EXPAND]" : "[COLLAPSE]"}
            </span>
          </div>
        </CardHeader>
      </div>

      {!isCollapsed && (
        <CardContent>
          <div className="flex flex-col gap-4 font-mono text-[11px]">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                Cognitive Core Presets
              </label>
              <div className="grid grid-cols-3 gap-2">
                {STRATEGY_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => { setPersona(preset.persona); setInstructions(preset.instructions); setThreshold(preset.threshold); }}
                    className="py-1.5 px-2.5 rounded border border-zinc-800 bg-zinc-950/60 text-[11px] hover:bg-zinc-900 hover:text-zinc-200 hover:border-zinc-700 transition-all cursor-pointer font-bold tracking-wider uppercase text-zinc-400 text-center"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                Agent Trading Persona
              </label>
              <textarea
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                rows={2}
                placeholder="e.g. Conservative quant trading analyst focusing on long-term trends..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-zinc-200 focus:outline-none focus:border-zinc-700 transition-all font-sans leading-relaxed text-[11px] resize-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                Custom Strategy Instructions
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={4}
                placeholder="e.g. Respect strict RSI oversold limits..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-zinc-200 focus:outline-none focus:border-zinc-700 transition-all font-sans leading-relaxed text-[11px] resize-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                Emergency Drawdown Limit
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {THRESHOLD_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setThreshold(pct)}
                    className={`py-1.5 text-[12px] rounded border transition-all uppercase cursor-pointer ${
                      threshold === pct
                        ? "bg-zinc-800 text-zinc-100 border-zinc-600 font-bold"
                        : "text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300"
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-600 uppercase tracking-wider">Custom:</span>
                <input
                  type="number" min={1} max={50} value={threshold}
                  onChange={(e) => setThreshold(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-20 bg-zinc-950 border border-zinc-800 rounded p-1.5 text-zinc-200 focus:outline-none focus:border-zinc-700 transition-all text-[11px] text-center"
                />
                <span className="text-[11px] text-zinc-600">%</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button variant="primary" onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> SAVING CORE...</>
                ) : (
                  <><Save className="w-3.5 h-3.5 mr-1.5" /> COMMIT STRATEGY</>
                )}
              </Button>
            </div>

            {statusMsg && (
              <div className={`p-2.5 rounded text-[11px] font-mono font-bold tracking-wider text-center border ${
                statusMsg.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-rose-500/10 border-rose-500/20 text-rose-400"
              }`}>
                {statusMsg.type === "success" && <CheckCircle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                {statusMsg.text}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
});
