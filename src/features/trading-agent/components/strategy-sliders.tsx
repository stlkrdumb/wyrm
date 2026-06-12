"use client";

interface SlidersProps {
  orderSize: number;
  setOrderSize: (v: number) => void;
  cycleInterval: number;
  setCycleInterval: (v: number) => void;
  stopLoss: number;
  setStopLoss: (v: number) => void;
  takeProfit: number;
  setTakeProfit: (v: number) => void;
}

export function StrategySliders({
  orderSize,
  setOrderSize,
  cycleInterval,
  setCycleInterval,
  stopLoss,
  setStopLoss,
  takeProfit,
  setTakeProfit,
}: SlidersProps) {
  return (
    <div className="border-t border-zinc-800/60 pt-3 space-y-3 font-mono text-[11px]">
      <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest block">
        Live Parameter Tuner
      </label>

      {/* Order Size & Cycle Interval */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-zinc-400">
            <span>Order Size</span>
            <span className="text-zinc-300 font-bold">{orderSize}%</span>
          </div>
          <input
            type="range" min={2} max={30} step={1} value={orderSize}
            onChange={(e) => setOrderSize(Number(e.target.value))}
            className="w-full accent-white h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-zinc-400">
            <span>Interval</span>
            <span className="text-zinc-300 font-bold">{cycleInterval}s</span>
          </div>
          <input
            type="range" min={10} max={300} step={5} value={cycleInterval}
            onChange={(e) => setCycleInterval(Number(e.target.value))}
            className="w-full accent-white h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      {/* SL & TP Sliders */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-zinc-400">
            <span>Stop Loss</span>
            <span className="text-zinc-300 font-bold">{stopLoss}%</span>
          </div>
          <input
            type="range" min={1} max={15} step={0.5} value={stopLoss}
            onChange={(e) => setStopLoss(Number(e.target.value))}
            className="w-full accent-white h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-zinc-400">
            <span>Take Profit</span>
            <span className="text-zinc-300 font-bold">{takeProfit}%</span>
          </div>
          <input
            type="range" min={2} max={30} step={0.5} value={takeProfit}
            onChange={(e) => setTakeProfit(Number(e.target.value))}
            className="w-full accent-white h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
