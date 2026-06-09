// Trading Agent Feature — Public API
export { SimOrderEngine } from "./services/sim-order-engine";
export { getTickerPrice, getOrderBook, getCandlestickData } from "./services/market-data.service";
export { evaluateSignals } from "./services/decision-engine.service";
export { DEFAULT_SYMBOLS, CANDLE_INTERVALS } from "./constants/symbols.constants";
export { sentimentService } from "./services/sentiment.service";

export type { TickerData, OrderBook, Candlestick } from "./types/market.types";
export type { Signal, SignalDirection, TechnicalAnalysisReport, SentimentScore, MarketRegime } from "./types/signal.types";
export type { Position, TradeRecord, PortfolioSnapshot, BacktestReport } from "./types/portfolio.types";
export type { SentimentSnapshot } from "./services/sentiment.service";
