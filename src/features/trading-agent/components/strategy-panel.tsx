"use client";

import { useEffect, useState, memo } from "react";
import { Sliders, Save, CheckCircle, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from "@/shared/ui";
import { apiFetch } from "@/shared/utils/api-fetch";
import { StrategySliders } from "./strategy-sliders";

const STRATEGY_PRESETS = [
  {
    name: "CONSERVATIVE",
    persona: "Wyrm, a highly disciplined, risk-averse quantitative spot agent. Core directive is capital preservation and steady compounding by trading only the safest, highest-liquidity assets.",
    instructions: `Workflow: Scan the top 20 coins by volume. Filter out low-cap or highly speculative assets. Select 1 or 2 established large-cap coins showing stable liquidity and steady market structures.

Strategy: Low-Volatility Pullback Trader.
Filters: Focus on 4H and Daily charts. Price must be comfortably above the 200 EMA.
Entry: Buy spot only during a significant market pullback, when price touches the lower Bollinger Band or major horizontal support, and RSI drops to an oversold 30-35.

Risk Management: Strict. Position size is 5% to 10% of total capital per trade. Max 3 active trades. Stop-Loss is tightly placed 3% below structure. Take-Profit 1 sells 50% of the position at +5% to lock in gains and moves stop to break-even. Take-Profit 2 sells the rest at +10% or the middle Bollinger Band.`,
    threshold: 5,
    orderSize: 5,
    stopLoss: 3,
    takeProfit: 10,
    cycleInterval: 60,
  },
  {
    name: "BALANCED",
    persona: "Wyrm, an adaptable, value-driven quantitative spot agent. Core directive is balancing risk and reward by capturing established mid-term trends. Avoids both extreme panic-selling and reckless FOMO.",
    instructions: `Workflow: Scan the top 20 coins by volume. Identify 1 or 2 assets that have finished a healthy consolidation phase and are beginning a clear, structured upward continuation.

Strategy: Trend Continuation Swing.
Filters: Focus on 1H and 4H charts. Price must be holding above the 50 EMA.
Entry: Buy spot when price successfully retests a broken resistance level as new support, accompanied by steady volume rising above the 20 Volume MA and RSI resetting to a neutral 50.

Risk Management: Moderate. Position size is 15% of total capital per trade. Max 4 active trades. Stop-Loss is fixed at 5% below the recent swing low. Take-Profit 1 sells 50% of the position at +10% and moves stop to break-even. Take-Profit 2 sells the remainder at +20% or major overhead resistance.`,
    threshold: 8,
    orderSize: 15,
    stopLoss: 5,
    takeProfit: 20,
    cycleInterval: 30,
  },
  {
    name: "AGGRESSIVE",
    persona: "Wyrm, a hyper-focused, predatory momentum agent. Core directive is exploiting immediate liquidity and massive volatility. Ruthlessly efficient and fast, striking hot targets to extract rapid gains from chaotic price movements.",
    instructions: `Workflow: Scan the top 20 coins by volume. Instantly isolate the 1 or 2 assets experiencing explosive, unusual volume spikes and intense retail interest. Ignore stagnant charts entirely.

Strategy: High-Volume Velocity Breakout.
Filters: Focus on 15M and 1H charts. Asset must show a sudden 2x volume spike above its 20 Volume MA.
Entry: Buy spot immediately when price breaks above local resistance or the upper Bollinger Band on heavy volume, with RSI in the 65-75 acceleration zone.

Risk Management: High exposure. Position size is 25% of total capital per trade. Max 2 simultaneous trades. Stop-Loss is tight, fixed at 2% to 3% below entry to prevent downside traps. Take-Profit 1 sells 50% of the position at +5% and moves stop to break-even. Take-Profit 2 sells the remaining half at +12% or when 15M volume begins to exhaust.`,
    threshold: 12,
    orderSize: 25,
    stopLoss: 3,
    takeProfit: 12,
    cycleInterval: 10,
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

  const getStrategyBias = () => {
    if (!persona.trim() && !instructions.trim()) return "CUSTOM";
    const text = (persona + " " + instructions).toLowerCase();
    if (text.includes("aggressive") || text.includes("scalp") || text.includes("high-frequency") || text.includes("momentum")) return "AGGRESSIVE";
    if (text.includes("conservative") || text.includes("preserve") || text.includes("safety") || text.includes("risk-averse")) return "CONSERVATIVE";
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
                      setPersona(preset.persona);
                      setInstructions(preset.instructions);
                      setThreshold(preset.threshold);
                      setOrderSize(preset.orderSize);
                      setStopLoss(preset.stopLoss);
                      setTakeProfit(preset.takeProfit);
                      setCycleInterval(preset.cycleInterval);
                    }}
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
                rows={4}
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
                rows={6}
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

            <StrategySliders
              orderSize={orderSize}
              setOrderSize={setOrderSize}
              cycleInterval={cycleInterval}
              setCycleInterval={setCycleInterval}
              stopLoss={stopLoss}
              setStopLoss={setStopLoss}
              takeProfit={takeProfit}
              setTakeProfit={setTakeProfit}
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
