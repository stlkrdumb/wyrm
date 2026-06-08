// Default trading symbols for the agent to monitor

export const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT"] as const;

export type TradingSymbol = (typeof DEFAULT_SYMBOLS)[number];

// Supported time intervals for candlestick data
export const CANDLE_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];
