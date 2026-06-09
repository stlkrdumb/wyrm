import { optionalFetch } from "./proxy-client";
import { priceStore } from "./price-store";

export interface SentimentSnapshot {
  symbol: string;
  fearAndGreedValue: number;
  fearAndGreedClassification: string;
  longShortRatio: number;
  longRatio: number;
  shortRatio: number;
  fundingRate: number;
  openInterest: number;
  timestamp: Date;
}

class SentimentService {
  private cache = new Map<string, SentimentSnapshot>();
  private cacheDurationMs = 5 * 60 * 1000; // 5 minutes cache

  public async getSentiment(symbol: string): Promise<SentimentSnapshot> {
    const uppercaseSymbol = symbol.toUpperCase();

    // If backtesting, return neutral sentiment mock to avoid lookahead bias and live API calls
    if (priceStore.isBacktesting) {
      return {
        symbol: uppercaseSymbol,
        fearAndGreedValue: 50,
        fearAndGreedClassification: "Neutral",
        longShortRatio: 1.0,
        longRatio: 0.5,
        shortRatio: 0.5,
        fundingRate: 0.0,
        openInterest: 0.0,
        timestamp: new Date(),
      };
    }

    const cached = this.cache.get(uppercaseSymbol);
    if (cached && Date.now() - cached.timestamp.getTime() < this.cacheDurationMs) {
      return cached;
    }

    try {
      const snapshot = await this.fetchLiveSentiment(uppercaseSymbol);
      this.cache.set(uppercaseSymbol, snapshot);
      return snapshot;
    } catch (err) {
      console.warn(`[SentimentService] Failed to fetch live sentiment for ${uppercaseSymbol}, falling back to cache or default:`, err);
      if (cached) {
        return cached;
      }
      return {
        symbol: uppercaseSymbol,
        fearAndGreedValue: 50,
        fearAndGreedClassification: "Neutral (Fallback)",
        longShortRatio: 1.0,
        longRatio: 0.5,
        shortRatio: 0.5,
        fundingRate: 0.0,
        openInterest: 0.0,
        timestamp: new Date(),
      };
    }
  }

  private async fetchLiveSentiment(symbol: string): Promise<SentimentSnapshot> {
    const productType = "USDT-FUTURES";

    // 1. Fetch Fear & Greed Index
    let fngValue = 50;
    let fngClass = "Neutral";
    try {
      const fngResp = await optionalFetch<any>("https://api.alternative.me/fng/?limit=1");
      if (fngResp && fngResp.data && fngResp.data[0]) {
        fngValue = Number(fngResp.data[0].value) || 50;
        fngClass = fngResp.data[0].value_classification || "Neutral";
      }
    } catch (err) {
      console.warn("[SentimentService] Fear & Greed fetch failed:", err);
    }

    // 2. Fetch Long/Short Ratio
    let longShortRatio = 1.0;
    let longRatio = 0.5;
    let shortRatio = 0.5;
    try {
      const lsUrl = `https://api.bitget.com/api/v2/mix/market/long-short?symbol=${symbol}&productType=${productType}`;
      const lsResp = await optionalFetch<any>(lsUrl);
      if (lsResp && lsResp.code === "00000" && Array.isArray(lsResp.data) && lsResp.data.length > 0) {
        const latest = lsResp.data[lsResp.data.length - 1];
        longShortRatio = Number(latest.longShortRatio) || 1.0;
        longRatio = Number(latest.longRatio) || 0.5;
        shortRatio = Number(latest.shortRatio) || 0.5;
      }
    } catch (err) {
      console.warn(`[SentimentService] Long/Short ratio fetch failed for ${symbol}:`, err);
    }

    // 3. Fetch Funding Rate
    let fundingRate = 0.0;
    try {
      const frUrl = `https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=${symbol}&productType=${productType}`;
      const frResp = await optionalFetch<any>(frUrl);
      if (frResp && frResp.code === "00000" && Array.isArray(frResp.data) && frResp.data.length > 0) {
        fundingRate = Number(frResp.data[0].fundingRate) || 0.0;
      }
    } catch (err) {
      console.warn(`[SentimentService] Funding rate fetch failed for ${symbol}:`, err);
    }

    // 4. Fetch Open Interest
    let openInterest = 0.0;
    try {
      const oiUrl = `https://api.bitget.com/api/v2/mix/market/open-interest?symbol=${symbol}&productType=${productType}`;
      const oiResp = await optionalFetch<any>(oiUrl);
      if (oiResp && oiResp.code === "00000" && oiResp.data && oiResp.data.openInterestList) {
        const oiItem = oiResp.data.openInterestList.find((item: any) => item.symbol === symbol);
        if (oiItem) {
          openInterest = Number(oiItem.size) || 0.0;
        }
      }
    } catch (err) {
      console.warn(`[SentimentService] Open interest fetch failed for ${symbol}:`, err);
    }

    return {
      symbol,
      fearAndGreedValue: fngValue,
      fearAndGreedClassification: fngClass,
      longShortRatio,
      longRatio,
      shortRatio,
      fundingRate,
      openInterest,
      timestamp: new Date(),
    };
  }
}

export const sentimentService = new SentimentService();
