"use client";

import { useEffect, useState, memo } from "react";
import { Sliders, Save, CheckCircle, Loader2, Cpu, ShieldAlert, Settings2, FileCode, Info } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from "@/shared/ui";
import { apiFetch } from "@/shared/utils/api-fetch";

const STRATEGY_PRESETS = [
  {
    name: "CONSERVATIVE",
    persona: "Defensive capital preserver. Only trade setups with clear 1d trend alignment and 1h confirmation.",
    instructions: `Data Priority: 1d EMA20 direction > 1h RSI + Bollinger Bands > sentiment

Entry: 1h RSI < 35 and price near lower Bollinger AND 1d EMA20 sloping up. Fear & Greed < 40 (fear selling into dip) strongly preferred.

Exit: 1h RSI > 65 or MACD hist crosses below zero. Take partial at +5% (sell action with strength -0.5), full at +10% (sell action with strength -1.0).

Risk: Limit to strongest single setup. Avoid coins with >5% 24h volatility.`,
    threshold: 5,
    orderSize: 5,
    stopLoss: 4,
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

Exit: 1h MACD hist decreasing by 50% from peak, or RSI > 70. Scale out at +10% (sell action with strength -0.5), full at +20% (sell action with strength -1.0).

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

Exit: 5m RSI crossing below 45 or 1h MACD hist declining. Quick partial at +5% (sell action with strength -0.5), full at +12% (sell action with strength -1.0).

Risk: 1-2 concurrent positions. Accept 2-3% daily drawdown. High conviction only (strength > 0.5).`,
    threshold: 12,
    orderSize: 25,
    stopLoss: 5,
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
  
  // Custom sub-navigation tab
  const [configTab, setConfigTab] = useState<"personality" | "risk" | "execution">("personality");

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

  const getDrawdownBadgeColor = (val: number) => {
    if (val <= 5) return "text-emerald-400 border-emerald-950 bg-emerald-950/20";
    if (val <= 10) return "text-amber-400 border-amber-950 bg-amber-950/20";
    return "text-rose-400 border-rose-950 bg-rose-950/20";
  };

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
    <Card className="flex flex-col h-full min-h-0 border-zinc-800 bg-zinc-950/30">
      <CardHeader className="border-b border-zinc-900/60 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-zinc-400" />
          <CardTitle>Agent Customizer</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={activePreset === "AGGRESSIVE" ? "warning" : activePreset === "CONSERVATIVE" ? "success" : "neutral"} className="text-[10px] tracking-widest">
            {activePreset}
          </Badge>
          <span className={`text-[10px] font-mono border px-2 py-0.5 rounded-full tracking-wider font-bold ${getDrawdownBadgeColor(threshold)}`}>
            HALT @ {threshold}% DD
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0 overflow-y-auto scrollbar-none pt-4">
        {/* Core Sub Navigation */}
        <div className="flex border-b border-zinc-900 mb-5 font-mono text-[11px] uppercase font-bold tracking-wider flex-shrink-0">
          <button
            onClick={() => setConfigTab("personality")}
            className={`flex-1 pb-3 border-b-2 text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              configTab === "personality"
                ? "border-white text-white font-black"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            1. Cognitive Core
          </button>
          <button
            onClick={() => setConfigTab("risk")}
            className={`flex-1 pb-3 border-b-2 text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              configTab === "risk"
                ? "border-white text-white font-black"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            2. Risk Profiles
          </button>
          <button
            onClick={() => setConfigTab("execution")}
            className={`flex-1 pb-3 border-b-2 text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              configTab === "execution"
                ? "border-white text-white font-black"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            3. Live Tuning
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          {/* TAB 1: COGNITIVE PROFILE */}
          {configTab === "personality" && (
            <div className="flex flex-col gap-4 font-mono text-[11px] flex-1">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                    Select Base Preset Template
                  </label>
                  <span className="text-[9px] text-zinc-600">Select custom to edit code</span>
                </div>
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
                      className={`py-2 px-2.5 rounded border text-[11px] transition-all cursor-pointer font-bold tracking-wider uppercase text-center ${
                        activePreset === preset.name
                          ? "bg-zinc-800 text-white border-zinc-600 shadow-[0_0_12px_rgba(255,255,255,0.05)]"
                          : "border-zinc-900 bg-zinc-950/40 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300 hover:border-zinc-800"
                      }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text Area 1: Trading Persona */}
              <div className="flex flex-col gap-1.5 flex-1 min-h-[120px]">
                <div className="flex items-center justify-between bg-zinc-950 border border-zinc-900 rounded-t px-3 py-1.5 border-b-0 shrink-0">
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <FileCode className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-[10px] uppercase font-bold tracking-widest">agent_persona.cfg</span>
                  </div>
                  {isLocked ? (
                    <span className="text-[9px] text-amber-500/80 uppercase font-bold tracking-wider px-1.5 py-0.2 bg-amber-500/5 border border-amber-500/10 rounded">LOCKED</span>
                  ) : (
                    <span className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider px-1.5 py-0.2 bg-emerald-400/5 border border-emerald-400/10 rounded">EDITABLE</span>
                  )}
                </div>
                <textarea
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  readOnly={isLocked}
                  placeholder="Describe the agent's behavior and fundamental bias. Locked to presets until you select Custom..."
                  className={`w-full flex-1 bg-zinc-950 border rounded-b p-3 text-zinc-300 transition-all font-mono leading-relaxed text-[11px] resize-none min-h-[90px] focus:outline-none ${
                    isLocked
                      ? "border-zinc-900 text-zinc-500 cursor-default bg-zinc-950/20"
                      : "border-zinc-800 focus:border-zinc-700 shadow-inner"
                  }`}
                />
              </div>

              {/* Text Area 2: Custom Instructions */}
              <div className="flex flex-col gap-1.5 flex-1 min-h-[160px]">
                <div className="flex items-center justify-between bg-zinc-950 border border-zinc-900 rounded-t px-3 py-1.5 border-b-0 shrink-0">
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <FileCode className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-[10px] uppercase font-bold tracking-widest">strategy_rules.prompt</span>
                  </div>
                  {isLocked ? (
                    <span className="text-[9px] text-amber-500/80 uppercase font-bold tracking-wider px-1.5 py-0.2 bg-amber-500/5 border border-amber-500/10 rounded">LOCKED</span>
                  ) : (
                    <span className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider px-1.5 py-0.2 bg-emerald-400/5 border border-emerald-400/10 rounded">EDITABLE</span>
                  )}
                </div>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  readOnly={isLocked}
                  placeholder="Specify absolute entry, exit, indicators guidelines and risk constraints the LLM engine must execute..."
                  className={`w-full flex-1 bg-zinc-950 border rounded-b p-3 text-zinc-300 transition-all font-mono leading-relaxed text-[11px] resize-none min-h-[120px] focus:outline-none ${
                    isLocked
                      ? "border-zinc-900 text-zinc-500 cursor-default bg-zinc-950/20"
                      : "border-zinc-800 focus:border-zinc-700 shadow-inner"
                  }`}
                />
              </div>
            </div>
          )}

          {/* TAB 2: RISK MANAGEMENT */}
          {configTab === "risk" && (
            <div className="flex flex-col gap-5 font-mono text-[11px] flex-1">
              {/* Emergency Drawdown Preset Buttons */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
                    Emergency Drawdown Limit
                  </label>
                  <span className="text-zinc-600">(MAX DRAWDOWN RISK LEVEL)</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {THRESHOLD_PRESETS.map((pct) => {
                    const isActive = threshold === pct;
                    return (
                      <button
                        key={pct}
                        onClick={() => setThreshold(pct)}
                        className={`py-2 text-[12px] rounded border transition-all uppercase cursor-pointer text-center font-bold ${
                          isActive
                            ? "bg-zinc-800 text-zinc-100 border-zinc-600 shadow-[0_0_8px_rgba(255,255,255,0.02)]"
                            : "text-zinc-500 border-zinc-900/60 bg-zinc-950/30 hover:border-zinc-800 hover:text-zinc-300"
                        }`}
                      >
                        {pct}%
                      </button>
                    );
                  })}
                </div>
                
                <div className="flex items-center gap-3 bg-zinc-950/50 p-2 border border-zinc-900 rounded mt-1">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Custom Threshold:</span>
                  <input
                    type="number" min={1} max={50} value={threshold}
                    onChange={(e) => setThreshold(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-16 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-zinc-700 transition-all text-[11px] text-center"
                  />
                  <span className="text-[10px] text-zinc-500 uppercase">% MAX PORTFOLIO SLIPPAGE</span>
                </div>
              </div>

              <div className="border-t border-zinc-900/80 pt-4 space-y-4">
                <div className="flex items-center gap-1.5 mb-1 text-zinc-400">
                  <label className="text-[11px] font-bold uppercase tracking-widest">Target Profit & Stop parameters</label>
                </div>

                {/* Stop Loss Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">Stop Loss (SL)</span>
                    <span className="text-rose-400 font-black tracking-tight border border-rose-950/50 bg-rose-950/15 px-2 py-0.5 rounded text-[10px]">-{stopLoss}%</span>
                  </div>
                  <input
                    type="range" min={1} max={15} step={0.5} value={stopLoss}
                    onChange={(e) => setStopLoss(Number(e.target.value))}
                    className="w-full accent-white h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer border border-zinc-800/80"
                  />
                  <p className="text-[9px] text-zinc-500 leading-normal font-sans">
                    Initial exit protection trigger. Sells position instantly if losses exceed this target.
                  </p>
                </div>

                {/* Take Profit Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">Take Profit (TP)</span>
                    <span className="text-emerald-400 font-black tracking-tight border border-emerald-950/50 bg-emerald-950/15 px-2 py-0.5 rounded text-[10px]">+{takeProfit}%</span>
                  </div>
                  <input
                    type="range" min={2} max={30} step={0.5} value={takeProfit}
                    onChange={(e) => setTakeProfit(Number(e.target.value))}
                    className="w-full accent-white h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer border border-zinc-800/80"
                  />
                  <p className="text-[9px] text-zinc-500 leading-normal font-sans">
                    Automated exit bracket target. Captures profit instantly when price moves in target direction.
                  </p>
                </div>

                {/* Max Positions Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">Max Active Positions</span>
                    <span className="text-zinc-200 font-black tracking-tight border border-zinc-800 bg-zinc-900 px-2 py-0.5 rounded text-[10px]">{maxActivePositions} Pairs</span>
                  </div>
                  <input
                    type="range" min={1} max={10} step={1} value={maxActivePositions}
                    onChange={(e) => setMaxActivePositions(Number(e.target.value))}
                    className="w-full accent-white h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer border border-zinc-800/80"
                  />
                  <p className="text-[9px] text-zinc-500 leading-normal font-sans">
                    Limits concurrent open pairs. Ensures capital diversity and prevents risk consolidation.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LIVE TUNING */}
          {configTab === "execution" && (
            <div className="flex flex-col gap-5 font-mono text-[11px] flex-1">
              <div className="space-y-4">
                <div className="flex items-center gap-1.5 mb-1 text-zinc-400">
                  <label className="text-[11px] font-bold uppercase tracking-widest">Engine Loop Settings</label>
                </div>

                {/* Order Size Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">Order Size (% Equity)</span>
                    <span className="text-zinc-200 font-black tracking-tight border border-zinc-800 bg-zinc-900 px-2 py-0.5 rounded text-[10px]">{orderSize}% Portfolio</span>
                  </div>
                  <input
                    type="range" min={2} max={30} step={1} value={orderSize}
                    onChange={(e) => setOrderSize(Number(e.target.value))}
                    className="w-full accent-white h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer border border-zinc-800/80"
                  />
                  <p className="text-[9px] text-zinc-500 leading-normal font-sans">
                    Amount of available cash/equity mapped to a single trade. Adjusted dynamically by agent confidence.
                  </p>
                </div>

                {/* Cycle Interval Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">Cycle Interval (Frequency)</span>
                    <span className="text-zinc-200 font-black tracking-tight border border-zinc-800 bg-zinc-900 px-2 py-0.5 rounded text-[10px]">{cycleInterval} seconds</span>
                  </div>
                  <input
                    type="range" min={10} max={300} step={5} value={cycleInterval}
                    onChange={(e) => setCycleInterval(Number(e.target.value))}
                    className="w-full accent-white h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer border border-zinc-800/80"
                  />
                  <p className="text-[9px] text-zinc-500 leading-normal font-sans">
                    Time delay between LLM analysis steps. Lower ranges increase reactivity; higher ranges preserve tokens.
                  </p>
                </div>

                {/* Conviction Threshold Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">Conviction Filter Threshold</span>
                    <span className="text-zinc-200 font-black tracking-tight border border-zinc-800 bg-zinc-900 px-2 py-0.5 rounded text-[10px]">{convictionThreshold.toFixed(2)} Confidence</span>
                  </div>
                  <input
                    type="range" min={0.1} max={0.9} step={0.05} value={convictionThreshold}
                    onChange={(e) => setConvictionThreshold(Number(e.target.value))}
                    className="w-full accent-white h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer border border-zinc-800/80"
                  />
                  <p className="text-[9px] text-zinc-500 leading-normal font-sans">
                    Strict cut-off for decisions. Any LLM suggestion with entry confidence lower than this will be discarded.
                  </p>
                </div>
              </div>

              {/* Informative panel */}
              <div className="p-3 bg-zinc-950 border border-zinc-900 rounded flex gap-2 font-sans text-zinc-400 leading-normal items-start mt-2">
                <Info className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5" />
                <div className="text-[10px]">
                  <span className="font-bold text-zinc-300 block mb-0.5 uppercase tracking-wider font-mono">Live Loop Updates</span>
                  Saving these variables triggers an in-memory hot reload. The agent will read these parameters during its next cycle run without requiring system reboots.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Global Save Button - Always Visible at the Bottom of CardContent */}
        <div className="border-t border-zinc-900/80 pt-4 mt-5 flex-shrink-0">
          <div className="flex flex-col gap-2.5">
            <Button variant="primary" onClick={handleSave} disabled={saving} className="w-full uppercase font-bold py-2 tracking-widest text-[11px]">
              {saving ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5 text-zinc-400" /> RE-INJECTING STRATEGY OVERLAYS...</>
              ) : (
                <><Save className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> SAVE & APPLY STRATEGY CONFIGURATION</>
              )}
            </Button>

            {statusMsg && (
              <div className={`p-2 rounded text-[10px] font-mono font-bold tracking-wider text-center border ${
                statusMsg.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 animate-pulse"
                  : "bg-rose-500/10 border-rose-500/20 text-rose-400"
              }`}>
                {statusMsg.type === "success" && <CheckCircle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                {statusMsg.text}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
