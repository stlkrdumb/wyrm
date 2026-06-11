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
  private cacheDurationMs = (Number(process.env.NEWS_CACHE_TTL_MINUTES) || 30) * 60 * 1000;

  public async getLatestNews(limit = 10): Promise<NewsArticle[]> {
    if (this.cachedNews.length > 0 && Date.now() - this.lastFetchTime < this.cacheDurationMs) {
      return this.cachedNews.slice(0, limit);
    }

    try {
      const url = "https://news.google.com/rss/search?q=cryptocurrency+OR+bitcoin+OR+ethereum&hl=en-US&gl=US&ceid=US:en";
      const res = await fetch(url, { 
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10_000)
      });

      if (res.ok) {
        const text = await res.text();
        const itemMatches = text.match(/<item>[\s\S]*?<\/item>/g) || [];
        
        if (itemMatches.length > 0) {
          const articles: NewsArticle[] = itemMatches.map((item, idx) => {
            const rawTitle = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "Breaking Crypto Headline";
            const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "#";
            const pubDateStr = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
            const sourceName = item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "Google News";
            
            // Clean up XML/HTML entities
            const title = rawTitle
              .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'");

            const publishedOn = pubDateStr 
              ? Math.floor(new Date(pubDateStr).getTime() / 1000) 
              : Math.floor(Date.now() / 1000);

            const sentimentInfo = this.analyzeSentiment(title);

            return {
              id: String(idx + 1),
              title,
              body: `Latest coverage regarding this macro crypto event, sourced from ${sourceName}.`,
              source: sourceName,
              url: link,
              publishedOn,
              sentiment: sentimentInfo.sentiment,
              score: sentimentInfo.score,
            };
          });

          this.cachedNews = articles;
          this.lastFetchTime = Date.now();
          console.log(`[NewsService] Successfully loaded ${articles.length} news articles from Google News RSS.`);
          return articles.slice(0, limit);
        }
      } else {
        console.warn(`[NewsService] Google News RSS returned non-ok status: ${res.status}`);
      }
    } catch (err: any) {
      console.warn("[NewsService] Failed to fetch live RSS news, using fallback news feed:", err?.message || err);
    }

    // Fallback if network fails
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
      "greed", "buying", "adoption", "positive", "highs", "record", "support",
      "acquisition", "acquires", "buys", "purchase"
    ];

    const bearishWords = [
      "bearish", "crash", "drops", "dips", "rejected", "lawsuit", "sec", 
      "losses", "liquidated", "liquidation", "outflows", "outflow", "dump", 
      "falls", "dip", "panic", "fear", "down", "regulatory", "ban", "hack",
      "plunge", "plunges", "slumps", "slump"
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

    if (bullCount > bearCount) {
      return { sentiment: "BULLISH", score: 1 };
    } else if (bearCount > bullCount) {
      return { sentiment: "BEARISH", score: -1 };
    } else {
      return { sentiment: "NEUTRAL", score: 0 };
    }
  }
}

export const newsService = new NewsService();
