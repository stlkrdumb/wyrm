import { optionalFetch } from "./proxy-client";

export interface NewsArticle {
  id: string;
  title: string;
  body: string;
  source: string;
  url: string;
  publishedOn: number;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  score: number; // 1 (Bullish), -1 (Bearish), 0 (Neutral)
}

const DEFAULT_NEWS: NewsArticle[] = [
  {
    id: "1",
    title: "Institutional ETF Inflows Surge Amid Spot Market Strength",
    body: "Major spot cryptocurrency exchange-traded funds recorded a massive net inflow over the last 24 hours, signalling strong interest from wall street.",
    source: "Coindesk",
    url: "https://www.coindesk.com",
    publishedOn: Math.floor(Date.now() / 1000) - 3600,
    sentiment: "BULLISH",
    score: 1,
  },
  {
    id: "2",
    title: "Market Liquidations Spike as Bitcoin Tests Support Level",
    body: "Leveraged traders faced liquidations as the asset fluctuated near key technical moving averages, clearing out late long positions.",
    source: "CryptoNews",
    url: "https://cryptopanic.com",
    publishedOn: Math.floor(Date.now() / 1000) - 7200,
    sentiment: "NEUTRAL",
    score: 0,
  },
  {
    id: "3",
    title: "Macro Rate Volatility Expectation Grows Ahead of Next Fed Meeting",
    body: "Analysts forecast heightened interest rate volatility which could lead to temporary liquidity drains across digital asset markets.",
    source: "Bloomberg",
    url: "https://www.bloomberg.com",
    publishedOn: Math.floor(Date.now() / 1000) - 10800,
    sentiment: "BEARISH",
    score: -1,
  }
];

class NewsService {
  private cachedNews: NewsArticle[] = [];
  private lastFetchTime = 0;
  private cacheDurationMs = 10 * 60 * 1000; // 10 minutes cache

  public async getLatestNews(limit = 10): Promise<NewsArticle[]> {
    if (this.cachedNews.length > 0 && Date.now() - this.lastFetchTime < this.cacheDurationMs) {
      return this.cachedNews.slice(0, limit);
    }

    try {
      const url = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";
      const response = await optionalFetch<any>(url);

      if (response && Array.isArray(response.Data)) {
        const articles: NewsArticle[] = response.Data.map((item: any) => {
          const title = item.title || "";
          const body = item.body || "";
          const sentimentInfo = this.analyzeSentiment(title + " " + body);

          return {
            id: item.id || String(Math.random()),
            title,
            body: item.body ? (item.body.slice(0, 150) + "...") : "",
            source: item.source_info?.name || item.source || "Crypto Feed",
            url: item.url || "#",
            publishedOn: Number(item.published_on) || Math.floor(Date.now() / 1000),
            sentiment: sentimentInfo.sentiment,
            score: sentimentInfo.score,
          };
        });

        this.cachedNews = articles;
        this.lastFetchTime = Date.now();
        console.log(`[NewsService] Successfully loaded ${articles.length} news articles.`);
        return articles.slice(0, limit);
      }
    } catch (err) {
      console.warn("[NewsService] Failed to fetch live news, using fallback news feed:", err);
    }

    // Fallback if network or proxy fails
    if (this.cachedNews.length === 0) {
      this.cachedNews = DEFAULT_NEWS;
      this.lastFetchTime = Date.now();
    }
    return this.cachedNews.slice(0, limit);
  }

  public async getNewsPromptContext(limit = 3): Promise<string> {
    try {
      const news = await this.getLatestNews(limit);
      if (news.length === 0) return "No recent news available.";

      return news
        .map((art, idx) => `${idx + 1}. Title: ${art.title} (Sentiment: ${art.sentiment})`)
        .join("\n");
    } catch (err) {
      return "No recent news available.";
    }
  }

  private analyzeSentiment(text: string): { sentiment: "BULLISH" | "BEARISH" | "NEUTRAL"; score: number } {
    const cleanText = text.toLowerCase();

    const bullishWords = [
      "bullish", "rally", "surges", "growth", "approved", "gain", "breakout", 
      "inflows", "inflow", "boost", "climb", "rises", "soar", "jump", 
      "greed", "buying", "adoption", "positive", "highs", "record", "support"
    ];

    const bearishWords = [
      "bearish", "crash", "drops", "dips", "rejected", "lawsuit", "sec", 
      "losses", "liquidated", "liquidation", "outflows", "outflow", "dump", 
      "falls", "dip", "panic", "fear", "down", "regulatory", "ban", "hack"
    ];

    let bullCount = 0;
    let bearCount = 0;

    bullishWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, "g");
      const matches = cleanText.match(regex);
      if (matches) bullCount += matches.length;
    });

    bearishWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, "g");
      const matches = cleanText.match(regex);
      if (matches) bearCount += matches.length;
    });

    if (bullCount > bearCount + 1) {
      return { sentiment: "BULLISH", score: 1 };
    } else if (bearCount > bullCount + 1) {
      return { sentiment: "BEARISH", score: -1 };
    } else {
      return { sentiment: "NEUTRAL", score: 0 };
    }
  }
}

export const newsService = new NewsService();
