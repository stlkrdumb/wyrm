"use client";

import { useEffect, useState, memo } from "react";
import { Sliders, Save, CheckCircle, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from "@/shared/ui";
import { apiFetch } from "@/shared/utils/api-fetch";
import { StrategySliders } from "./strategy-sliders";

const STRATEGY_PRESETS = [
  {
    name: "CONSERVATIVE",
    persona: "Defensive capital preserver. Only trade setups with clear 1d trend alignment and 1h confirmation.",
    instructions: `Data Priority: 1d EMA20 direction > 1h RSI + Bollinger Bands > sentiment

Entry: 1h RSI < 35 and price near lower Bollinger AND 1d EMA20 sloping up. Fear & Greed < 40 (fear selling into dip) strongly preferred.

Exit: 1h RSI > 65 or MACD hist crosses below zero. Take partial at +5%, full at +10%.

Risk: Limit to strongest single setup. Avoid coins with >5% 24h volatility.`,
    threshold: 5,
    orderSize: 5,
    stopLoss: 3,
    takeProfit: 10,
    cycleInterval: 60,
    maxActivePositions: 3,
    convictionThreshold: 0.3,
  },
  {
    name: "BALANCED",
    persona: "Trend swing trader. Capture mid-frame momentum with EMA alignment and MACD confirmation.",
    instructions: `Data Priority: 1h MACD hist trend + Bollinger squeeze > 1d EMA20 slope > 5m setup precision

Entry: 1h MACD hist positive and increasing for 3+ bars AND price above EMA20 AND Bollinger Bands expanding from squeeze. RSI 1h ideally 45-60.

Exit: 1h MACD hist decreasing by 50% from peak, or RSI > 70. Scale out at +10%, full at +20%.

Risk: 2-3 concurrent positions. Prefer coins with 2-4% 24h volatility.`,
    threshold: 8,
    orderSize: 15,
    stopLoss: 5,
    takeProfit: 20,
    cycleInterval: 30,
    maxActivePositions: 3,
    convictionThreshold: 0.3,
  },
  {
    name: "AGGRESSIVE",
    persona: "Momentum scalper. Exploit high-volatility breakouts with 5m precision and 1h momentum alignment.",
    instructions: `Data Priority: 5m RSI velocity > 1h MACD hist strength > 1h Bollinger breakout > volatility

Entry: 5m RSI crossing above 55 with strong momentum + 1h MACD hist strongly positive AND 24h volatility > 4% AND Fear & Greed > 55 (greed amplifying momentum).

Exit: 5m RSI crossing below 45 or 1h MACD hist declining. Quick partial at +5%, full at +12%.

Risk: 1-2 concurrent positions. Accept 2-3% daily drawdown. High conviction only (strength > 0.5).`,
    threshold: 12,
    orderSize: 25,
    stopLoss: 3,
    takeProfit: 12,
    cycleInterval: 10,
    maxActivePositions: 3,
    convictionThreshold: 0.25,
  },
  {
    name: "CUSTOM",
    persona: "",
    instructions: "",
    threshold: 10,
    orderSize: 5,
    stopLoss: 5,
    takeProfit: 10,
    cycleInterval: 30,
    maxActivePositions: 3,
    convictionThreshold: 0.3,
  },
];

export const StrategyPanel = memo(function StrategyPanel() {
  const [persona, setPersona] = useState("");
  const [instructions, setInstructions] = useState("");
  const [threshold, setThreshold] = useState(10);
  const [orderSize, setOrderSize] = useState(5);
  const [stopLoss, setStopLoss] = useState(5);
  const [takeProfit, setTakeProfit] = useState(10);
  const [cycleInterval, setCycleInterval] = useState(30);
  const [maxActivePositions, setMaxActivePositions] = useState(3);
  const [convictionThreshold, setConvictionThreshold] = useState(0.3);
  const [activePreset, setActivePreset] = useState("CUSTOM");
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
        if (data.orderSizePct != null) setOrderSize(Math.round(data.orderSizePct * 100));
        if (data.stopLossPct != null) setStopLoss(data.stopLossPct);
        if (data.takeProfitPct != null) setTakeProfit(data.takeProfitPct);
        if (data.cycleIntervalMs != null) setCycleInterval(Math.round(data.cycleIntervalMs / 1000));
        if (data.maxActivePositions != null) setMaxActivePositions(data.maxActivePositions);
        if (data.convictionThreshold != null) setConvictionThreshold(data.convictionThreshold);
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
        body: JSON.stringify({
          persona,
          customInstructions: instructions,
          circuitBreakerThresholdPct: threshold,
          orderSizePct: orderSize / 100,
          stopLossPct: stopLoss,
          takeProfitPct: takeProfit,
          cycleIntervalMs: cycleInterval * 1000,
          maxActivePositions,
          convictionThreshold,
        }),
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

  const isLocked = activePreset !== "CUSTOM";
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
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-zinc-500" />
          <CardTitle>Agent Customizer</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={activePreset === "AGGRESSIVE" ? "warning" : activePreset === "CONSERVATIVE" ? "success" : "neutral"}>
            {activePreset}
          </Badge>
          <span className="text-[10px] font-mono text-zinc-600 border border-zinc-800 px-1.5 py-0.2 rounded tracking-wider">
            DD {threshold}%
          </span>
        </div>
      </CardHeader>

      <CardContent>
          <div className="flex flex-col gap-4 font-mono text-[11px]">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                Cognitive Core Presets
              </label>
              <div className="grid grid-cols-4 gap-2">
                {STRATEGY_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      setActivePreset(preset.name);
                      setPersona(preset.persona);
                      setInstructions(preset.instructions);
                      setThreshold(preset.threshold);
                      setOrderSize(preset.orderSize);
                      setStopLoss(preset.stopLoss);
                      setTakeProfit(preset.takeProfit);
                      setCycleInterval(preset.cycleInterval);
                      setMaxActivePositions(preset.maxActivePositions ?? 3);
                      setConvictionThreshold(preset.convictionThreshold ?? 0.3);
                    }}
                    className={`py-1.5 px-2.5 rounded border text-[11px] transition-all cursor-pointer font-bold tracking-wider uppercase text-center ${
                      activePreset === preset.name
                        ? "bg-white/15 text-white border-white/25"
                        : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 hover:border-zinc-700"
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  Agent Trading Persona
                </label>
                {isLocked && (
                  <span className="text-[9px] font-mono text-zinc-600 italic">
                    Switch to CUSTOM to edit
                  </span>
                )}
              </div>
              <textarea
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                readOnly={isLocked}
                rows={4}
                placeholder="e.g. Conservative quant trading analyst focusing on long-term trends..."
                className={`w-full bg-zinc-950 border rounded p-2.5 text-zinc-200 transition-all font-sans leading-relaxed text-[11px] resize-none ${
                  isLocked
                    ? "border-zinc-800/40 text-zinc-500 cursor-default"
                    : "border-zinc-800 focus:outline-none focus:border-zinc-700"
                }`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  Custom Strategy Instructions
                </label>
                {isLocked && (
                  <span className="text-[9px] font-mono text-zinc-600 italic">
                    Switch to CUSTOM to edit
                  </span>
                )}
              </div>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                readOnly={isLocked}
                rows={6}
                placeholder="e.g. Respect strict RSI oversold limits..."
                className={`w-full bg-zinc-950 border rounded p-2.5 text-zinc-200 transition-all font-sans leading-relaxed text-[11px] resize-none ${
                  isLocked
                    ? "border-zinc-800/40 text-zinc-500 cursor-default"
                    : "border-zinc-800 focus:outline-none focus:border-zinc-700"
                }`}
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

            <StrategySliders
              orderSize={orderSize}
              setOrderSize={setOrderSize}
              cycleInterval={cycleInterval}
              setCycleInterval={setCycleInterval}
              stopLoss={stopLoss}
              setStopLoss={setStopLoss}
              takeProfit={takeProfit}
              setTakeProfit={setTakeProfit}
              maxActivePositions={maxActivePositions}
              setMaxActivePositions={setMaxActivePositions}
              convictionThreshold={convictionThreshold}
              setConvictionThreshold={setConvictionThreshold}
            />

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
    </Card>
  );
});
