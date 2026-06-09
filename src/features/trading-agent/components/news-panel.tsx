"use client";

import { useEffect, useState, memo, useCallback } from "react";
import { Newspaper, TrendingUp, TrendingDown, Minus, ExternalLink, Loader2 } from "lucide-react";

interface NewsArticle {
  id: string;
  title: string;
  body: string;
  source: string;
  url: string;
  publishedOn: number;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  score: number;
}

export const NewsPanel = memo(function NewsPanel() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/news?limit=10");
      if (!res.ok) throw new Error("Failed to fetch news");
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setArticles(json.data);
      }
    } catch (err) {
      console.error("[NewsPanel] Error fetching news:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    // Refresh news every 3 minutes
    const id = setInterval(fetchNews, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchNews]);

  const getSentimentIcon = (sentiment: NewsArticle["sentiment"]) => {
    switch (sentiment) {
      case "BULLISH":
        return <TrendingUp className="w-3 h-3 text-emerald-400" />;
      case "BEARISH":
        return <TrendingDown className="w-3 h-3 text-rose-400" />;
      default:
        return <Minus className="w-3 h-3 text-zinc-500" />;
    }
  };

  const getSentimentColorClass = (sentiment: NewsArticle["sentiment"]) => {
    switch (sentiment) {
      case "BULLISH":
        return "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
      case "BEARISH":
        return "text-rose-400 border-rose-500/20 bg-rose-500/10";
      default:
        return "text-zinc-400 border-zinc-800 bg-zinc-900/40";
    }
  };

  const formatTimeAgo = (ts: number) => {
    const secs = Math.floor(Date.now() / 1000 - ts);
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  if (isLoading && articles.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden h-[380px] justify-center items-center">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
        <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase mt-2">
          Syncing Macro News...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5 rounded border border-zinc-900 bg-zinc-950/40 backdrop-blur-md relative overflow-hidden h-[380px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-900/50 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Newspaper className="w-3.5 h-3.5 text-zinc-550" />
          <span className="text-[10px] tracking-widest text-zinc-500 font-bold uppercase">
            Macro News & Sentiment
          </span>
        </div>
        <span className="text-[8px] font-mono text-zinc-650 bg-zinc-950/60 border border-zinc-900 px-1 py-0.2 rounded font-bold uppercase tracking-wider">
          LIVE NEWS
        </span>
      </div>

      {/* News Feed */}
      <div className="flex-grow overflow-y-auto space-y-3 pr-1.5 scrollbar-thin">
        {articles.length > 0 ? (
          articles.map((art) => (
            <div
              key={art.id}
              className="p-3 bg-zinc-900/10 border border-zinc-900 hover:border-zinc-800 rounded flex flex-col gap-2 transition-all hover:bg-zinc-950/20 group relative"
            >
              {/* Metadata */}
              <div className="flex justify-between items-center text-[8.5px] font-mono font-bold tracking-wider uppercase">
                <div className="flex items-center gap-1.5 text-zinc-550">
                  <span>{art.source}</span>
                  <span className="w-1 h-1 rounded-full bg-zinc-800" />
                  <span>{formatTimeAgo(art.publishedOn)}</span>
                </div>
                <div className={`flex items-center gap-1 px-1.5 py-0.2 rounded border ${getSentimentColorClass(art.sentiment)}`}>
                  {getSentimentIcon(art.sentiment)}
                  <span className="text-[8px] font-bold tracking-widest">{art.sentiment}</span>
                </div>
              </div>

              {/* Title & Link */}
              <a
                href={art.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-sans font-semibold leading-snug text-zinc-200 hover:text-zinc-100 flex items-start gap-1 transition-all group-hover:translate-x-0.5"
              >
                <span className="line-clamp-2">{art.title}</span>
                <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 mt-0.5 transition-colors" />
              </a>
            </div>
          ))
        ) : (
          <div className="text-[11px] font-mono text-zinc-500 py-12 text-center tracking-wide uppercase">
            No recent news headlines available
          </div>
        )}
      </div>
    </div>
  );
});
