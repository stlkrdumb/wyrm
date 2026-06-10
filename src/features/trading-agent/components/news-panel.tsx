"use client";

import { useEffect, useState, memo, useCallback } from "react";
import { Newspaper, TrendingUp, TrendingDown, Minus, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/shared/ui";

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
    const id = setInterval(fetchNews, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchNews]);

  const getSentimentIcon = (sentiment: NewsArticle["sentiment"]) => {
    switch (sentiment) {
      case "BULLISH": return <TrendingUp className="w-3 h-3 text-phosphor-green" />;
      case "BEARISH": return <TrendingDown className="w-3 h-3 text-phosphor-red" />;
      default: return <Minus className="w-3 h-3 text-phosphor-dim" />;
    }
  };

  const sentimentBadge = (sentiment: NewsArticle["sentiment"]) => {
    switch (sentiment) {
      case "BULLISH": return <Badge variant="success" className="text-[8px]">BULLISH</Badge>;
      case "BEARISH": return <Badge variant="danger" className="text-[8px]">BEARISH</Badge>;
      default: return <Badge variant="neutral" className="text-[8px]">NEUTRAL</Badge>;
    }
  };

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
    return `${Math.floor(diff / 86400_000)}d`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Macro News</CardTitle>
        <span className="text-[9px] font-mono text-phosphor-dim">
          {articles.length > 0 ? `${articles.length} headlines` : ""}
        </span>
      </CardHeader>
      <CardContent>
        {isLoading && articles.length === 0 ? (
          <div className="flex items-center justify-center h-[200px]">
            <Loader2 className="w-5 h-5 text-phosphor-dim animate-spin" />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-[11px] font-mono text-phosphor-dim py-8 text-center tracking-wide uppercase">
            No headlines right now
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto scrollbar-none pr-1 -mr-1">
            {articles.map((a) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-2.5 border border-amber-900/20 hover:border-amber-900/40 bg-[#0a0a0a]/30 hover:bg-[#0a0a0a]/50 transition-all duration-150 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-amber-100/80 font-medium leading-relaxed line-clamp-2 group-hover:text-amber-100 transition-colors font-mono">
                      {a.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[8px] font-mono text-phosphor-dim uppercase tracking-wider">{a.source}</span>
                      <span className="text-[8px] font-mono text-phosphor-dim/50">•</span>
                      <span className="text-[8px] font-mono text-phosphor-dim">{timeAgo(a.publishedOn)} ago</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {sentimentBadge(a.sentiment)}
                    <ExternalLink className="w-3 h-3 text-phosphor-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
