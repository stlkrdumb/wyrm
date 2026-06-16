"use client";

import { useEffect, useRef } from "react";

interface PerformanceMetrics {
  componentName: string;
  renderCount: number;
  averageRenderTime: number;
  lastRenderTime: number;
  maxRenderTime: number;
}

const metricsMap = new Map<string, PerformanceMetrics>();

/**
 * Monitors component render performance in development mode.
 * Attaches to React DevTools and console.logs render frequency.
 */
export function usePerformanceMonitor(
  componentName: string,
  thresholdMs: number = 16 // 16ms = 60fps
): void {
  const renderCountRef = useRef(0);
  const lastRenderStart = useRef<number>(0);
  const renderTimestampsRef = useRef<number[]>([]);

  useEffect(() => {
    renderCountRef.current = 0;
    renderTimestampsRef.current = [];
    return () => {
      metricsMap.delete(componentName);
    };
  }, [componentName]);

  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    const now = performance.now();
    lastRenderStart.current = now;
    renderCountRef.current++;

    // Track render timestamp for frequency analysis
    const timestamps = renderTimestampsRef.current;
    timestamps.push(now);
    
    // Keep last 60 timestamps only
    if (timestamps.length > 60) {
      timestamps.shift();
    }

    // Calculate render frequency (per second)
    if (renderCountRef.current > 1) {
      const elapsed = now - timestamps[0];
      const freq = timestamps.length / (elapsed / 1000);
      
      // Log high-frequency renders
      if (freq > 10) {
        console.warn(
          `[Perf] ${componentName}: High render frequency (${freq.toFixed(1)}/s). ` +
          `Consider adding useMemo/React.memo.`
        );
      }
    }

    // Register cleanup for next render timing
    requestAnimationFrame(() => {});
  }
}

/**
 * Reports on the render performance metrics for a component.
 * Use inside a render to log render counts and timing.
 */
export function useMeasureRender(componentName: string): void {
  const renderCountRef = useRef(0);
  const renderStartRef = useRef(performance.now());

  useEffect(() => {
    renderCountRef.current++;
    const renderTime = performance.now() - renderStartRef.current;

    const metrics = metricsMap.get(componentName) || {
      componentName,
      renderCount: 0,
      averageRenderTime: 0,
      lastRenderTime: 0,
      maxRenderTime: 0,
    };

    metrics.renderCount++;
    metrics.lastRenderTime = renderTime;
    metrics.averageRenderTime = 
      (metrics.averageRenderTime * (metrics.renderCount - 1) + renderTime) / 
      metrics.renderCount;
    metrics.maxRenderTime = Math.max(metrics.maxRenderTime, renderTime);

    metricsMap.set(componentName, metrics);

    renderStartRef.current = performance.now();
  });
}

/**
 * Returns all collected performance metrics. Useful for debugging.
 */
export function getPerformanceMetrics(): Map<string, PerformanceMetrics> {
  return metricsMap;
}

/**
 * Resets all performance tracking. Call before starting a new measurement session.
 */
export function resetPerformanceMetrics(): void {
  metricsMap.clear();
}
