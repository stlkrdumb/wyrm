"use client";

import { memo } from "react";

interface Props {
  value: number;
  size?: number;
  strokeWidth?: number;
}

export const RadialGauge = memo(function RadialGauge({ value, size = 120, strokeWidth = 8 }: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * Math.PI; // half circle
  const normalizedValue = Math.max(0, Math.min(100, value));
  const offset = circumference - (normalizedValue / 100) * circumference;

  const getColor = (val: number) => {
    if (val <= 25) return "#ef4444"; // red
    if (val <= 45) return "#f97316"; // orange
    if (val <= 55) return "#eab308"; // yellow
    if (val <= 75) return "#10b981"; // emerald
    return "#22c55e"; // green
  };

  const color = getColor(normalizedValue);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size / 1.5 }}>
      <svg width={size} height={size / 1.5} viewBox={`0 0 ${size} ${size / 1.5}`}>
        {/* Background arc */}
        <path
          d={`M ${strokeWidth / 2} ${size / 1.5} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 1.5}`}
          fill="none"
          stroke="#27272a"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Colored arc segments */}
        {[
          { start: 0, end: 20, color: "rgba(239, 68, 68, 0.3)" },
          { start: 20, end: 40, color: "rgba(249, 115, 22, 0.3)" },
          { start: 40, end: 60, color: "rgba(234, 179, 8, 0.3)" },
          { start: 60, end: 80, color: "rgba(16, 185, 129, 0.3)" },
          { start: 80, end: 100, color: "rgba(34, 197, 94, 0.3)" },
        ].map((seg) => {
          const startAngle = (seg.start / 100) * Math.PI;
          const endAngle = (seg.end / 100) * Math.PI;
          const x1 = size / 2 - radius * Math.cos(startAngle);
          const y1 = size / 1.5 - radius * Math.sin(startAngle);
          const x2 = size / 2 - radius * Math.cos(endAngle);
          const y2 = size / 1.5 - radius * Math.sin(endAngle);
          return (
            <path
              key={seg.start}
              d={`M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth - 2}
              strokeLinecap="round"
            />
          );
        })}
        {/* Value arc */}
        <path
          d={`M ${strokeWidth / 2} ${size / 1.5} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 1.5}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
        {/* Needle */}
        {(() => {
          const angle = (normalizedValue / 100) * Math.PI;
          const needleLength = radius - 4;
          const x = size / 2 - needleLength * Math.cos(angle);
          const y = size / 1.5 - needleLength * Math.sin(angle);
          return (
            <>
              <circle cx={size / 2} cy={size / 1.5} r={3} fill={color} />
              <line
                x1={size / 2}
                y1={size / 1.5}
                x2={x}
                y2={y}
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                className="transition-all duration-700 ease-out"
              />
            </>
          );
        })()}
      </svg>
      {/* Value label */}
      <div className="absolute bottom-0 flex flex-col items-center">
        <span className="text-[10px] font-mono font-bold text-zinc-500 tracking-widest uppercase">F&G</span>
      </div>
    </div>
  );
});
