// Perpetual futures types

export type MarketMode = "SPOT" | "PERP" | "HYBRID";

/** Leverage tier configuration from exchange */
export interface LeverageTier {
  maxLeverage: number;
  maintenanceMarginRate: number;
  minNotional: number;
}

/** Perpetual-specific ticker data */
export interface PerpTickerData {
  markPrice: number;
  fundingRate: number;
  nextFundingTime: number;
  openInterest: number;
  indexPrice: number;
}

/** Extended position for perpetual futures */
export interface PerpPosition {
  marketMode: "PERP";
  leverage: number;
  marginUsed: number;
  liquidationPrice: number;
  fundingPayments: number;
  lastFundingTimestamp: number;
}
