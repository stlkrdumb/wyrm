"use client";

import { useEffect, useState, memo } from "react";
import { Sliders, Save, CheckCircle, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from "@/shared/ui";

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
        const res = await fetch("/api/agent/strategy");
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
      const res = await fetch("/api/agent/strategy", {
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
            <Loader2 className="w-3.5 h-3.5 text-phosphor-dim animate-spin" />
            <CardTitle>Agent Customizer</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <span className="text-[10px] font-mono text-phosphor-dim tracking-widest uppercase">Loading Cognitive Core...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <div onClick={() => setIsCollapsed(!isCollapsed)} className="cursor-pointer select-none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-phosphor-dim" />
            <CardTitle>Agent Customizer</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={bias === "AGGRESSIVE" ? "warning" : bias === "CONSERVATIVE" ? "success" : "neutral"}>
              {bias}
            </Badge>
            <span className="text-[8px] font-mono text-phosphor-dim border border-amber-900/20 px-1.5 py-0.2 tracking-wider">
              DD {threshold}%
            </span>
            <span className="text-[8px] font-mono text-phosphor-dim uppercase tracking-widest">
              {isCollapsed ? "[EXPAND]" : "[COLLAPSE]"}
            </span>
          </div>
        </CardHeader>
      </div>

      {!isCollapsed && (
        <CardContent>
          <div className="flex flex-col gap-4 font-mono text-[11px]">
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold text-phosphor-dim uppercase tracking-widest">
                Cognitive Core Presets
              </label>
              <div className="grid grid-cols-3 gap-2">
                {STRATEGY_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => { setPersona(preset.persona); setInstructions(preset.instructions); setThreshold(preset.threshold); }}
                    className="terminal-btn py-1.5 px-2.5 text-[9px] font-bold tracking-wider uppercase text-center"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold text-phosphor-dim uppercase tracking-wider">
                Agent Trading Persona
              </label>
              <textarea
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                rows={2}
                placeholder="e.g. Conservative quant trading analyst focusing on long-term trends..."
                className="w-full terminal-input p-2.5 text-amber-100/70 leading-relaxed resize-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-bold text-phosphor-dim uppercase tracking-wider">
                Custom Strategy Instructions
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={4}
                placeholder="e.g. Respect strict RSI oversold limits..."
                className="w-full terminal-input p-2.5 text-amber-100/70 leading-relaxed resize-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-bold text-phosphor-dim uppercase tracking-widest">
                Emergency Drawdown Limit
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {THRESHOLD_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setThreshold(pct)}
                    className={`py-1.5 text-[10px] border transition-all uppercase cursor-pointer ${
                      threshold === pct
                        ? "bg-amber-900/20 text-phosphor border-amber-500/30 font-bold"
                        : "text-phosphor-dim border-amber-900/20 hover:border-amber-900/40 hover:text-phosphor-muted"
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-phosphor-dim uppercase tracking-wider">Custom:</span>
                <input
                  type="number" min={1} max={50} value={threshold}
                  onChange={(e) => setThreshold(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-20 terminal-input p-1.5 text-[11px] text-center"
                />
                <span className="text-[9px] text-phosphor-dim">%</span>
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
              <div className={`p-2.5 text-[9px] font-mono font-bold tracking-wider text-center border ${
                statusMsg.type === "success"
                  ? "bg-phosphor-green/5 border-phosphor-green/30 text-phosphor-green"
                  : "bg-phosphor-red/5 border-phosphor-red/30 text-phosphor-red"
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
