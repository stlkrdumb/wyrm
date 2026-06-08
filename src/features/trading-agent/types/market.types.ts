// Market data types from Bitget API

export interface TickerData {
  symbol: string;
  lastPrice: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24hPercent: number;
  timestamp: Date;
}

export interface OrderBookEntry {
  price: number;
  size: number;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: Date;
}

export interface Candlestick {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
