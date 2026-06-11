import { optionalFetch } from "./proxy-client";
import { bitgetClient } from "@/lib/bitget-client";
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
  private cacheDurationMs = (Number(process.env.SENTIMENT_CACHE_TTL_MINUTES) || 120) * 60 * 1000;
  private supportedSymbols = new Set(["BTCUSDT", "ETHUSDT"]);

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
    } catch (err: any) {
      console.warn(`[SentimentService] Failed to fetch live sentiment for ${uppercaseSymbol}, falling back to cache or default: ${err?.message || err}`);
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
    const isSupported = this.supportedSymbols.has(symbol);

    // 1. Fetch Fear & Greed Index (global — works for all symbols)
    let fngValue = 50;
    let fngClass = "Neutral";
    try {
      const fngResp = await optionalFetch<any>("https://api.alternative.me/fng/?limit=1");
      if (fngResp && fngResp.data && fngResp.data[0]) {
        fngValue = Number(fngResp.data[0].value) || 50;
        fngClass = fngResp.data[0].value_classification || "Neutral";
      }
    } catch (err: any) {
      console.warn("[SentimentService] Fear & Greed fetch failed:", err?.message || err);
    }

    // Per-symbol metrics — only fetch for supported major pairs
    let longShortRatio = 1.0;
    let longRatio = 0.5;
    let shortRatio = 0.5;
    let fundingRate = 0.0;
    let openInterest = 0.0;

    if (!isSupported) {
      return { symbol, fearAndGreedValue: fngValue, fearAndGreedClassification: fngClass, longShortRatio, longRatio, shortRatio, fundingRate, openInterest, timestamp: new Date() };
    }
    try {
      const lsResult = await bitgetClient.publicGet<Array<{
        longShortRatio: string;
        longRatio: string;
        shortRatio: string;
      }>>(
        "/api/v2/mix/market/long-short",
        { symbol, productType }
      );
      if (Array.isArray(lsResult.data) && lsResult.data.length > 0) {
        const latest = lsResult.data[lsResult.data.length - 1];
        longShortRatio = Number(latest.longShortRatio) || 1.0;
        longRatio = Number(latest.longRatio) || 0.5;
        shortRatio = Number(latest.shortRatio) || 0.5;
      }
    } catch (err: any) {
      console.warn(`[SentimentService] Long/Short ratio fetch failed for ${symbol}: ${err?.message || err}`);
    }

    // 3. Fetch Funding Rate
    fundingRate = 0.0;
    try {
      const frResult = await bitgetClient.publicGet<Array<{
        fundingRate: string;
      }>>(
        "/api/v2/mix/market/current-fund-rate",
        { symbol, productType }
      );
      if (Array.isArray(frResult.data) && frResult.data.length > 0) {
        fundingRate = Number(frResult.data[0].fundingRate) || 0.0;
      }
    } catch (err: any) {
      console.warn(`[SentimentService] Funding rate fetch failed for ${symbol}: ${err?.message || err}`);
    }

    // 4. Fetch Open Interest
    openInterest = 0.0;
    try {
      const oiResult = await bitgetClient.publicGet<{
        openInterestList: Array<{ symbol: string; size: string }>;
      }>(
        "/api/v2/mix/market/open-interest",
        { symbol, productType }
      );
      if (oiResult.data?.openInterestList) {
        const oiItem = oiResult.data.openInterestList.find((item: any) => item.symbol === symbol);
        if (oiItem) {
          openInterest = Number(oiItem.size) || 0.0;
        }
      }
    } catch (err: any) {
      console.warn(`[SentimentService] Open interest fetch failed for ${symbol}: ${err?.message || err}`);
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
