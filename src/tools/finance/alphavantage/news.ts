/**
 * Alpha Vantage news and sentiment tool.
 * Provides news articles with sentiment analysis.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callAlphaVantage } from './api.js';
import { formatToolResult } from '../../types.js';

const NewsInputSchema = z.object({
  ticker: z
    .string()
    .describe("The stock ticker symbol to fetch news for. For example, 'AAPL' for Apple."),
  start_date: z
    .string()
    .optional()
    .describe('The start date to fetch news from (YYYY-MM-DD). Alpha Vantage uses YYYYMMDDTHHMM format internally.'),
  end_date: z.string().optional().describe('The end date to fetch news to (YYYY-MM-DD).'),
  limit: z
    .number()
    .default(10)
    .describe('The number of news articles to retrieve. Max is 200 for Alpha Vantage.'),
});

/**
 * Convert YYYY-MM-DD to Alpha Vantage format YYYYMMDDTHHMM.
 */
function formatDateForAV(date: string | undefined, isEnd: boolean = false): string | undefined {
  if (!date) return undefined;
  // Convert YYYY-MM-DD to YYYYMMDDTHHMM
  const d = date.replace(/-/g, '');
  return isEnd ? `${d}T2359` : `${d}T0000`;
}

/**
 * Transform Alpha Vantage NEWS_SENTIMENT to normalized news format.
 */
function transformNews(data: Record<string, unknown>, limit: number): unknown[] {
  const feed = (data['feed'] as unknown[]) || [];
  
  return feed.slice(0, limit).map((item: unknown) => {
    const article = item as Record<string, unknown>;
    const tickerSentiments = (article['ticker_sentiment'] as unknown[]) || [];
    
    // Find the primary ticker sentiment
    const primarySentiment = tickerSentiments[0] as Record<string, string> | undefined;
    
    return {
      title: article['title'] || null,
      url: article['url'] || null,
      source: article['source'] || null,
      published_at: article['time_published'] || null,
      summary: article['summary'] || null,
      banner_image: article['banner_image'] || null,
      // Alpha Vantage sentiment data
      overall_sentiment_score: parseFloat(article['overall_sentiment_score'] as string) || null,
      overall_sentiment_label: article['overall_sentiment_label'] || null,
      // Ticker-specific sentiment
      ticker_sentiment_score: primarySentiment ? parseFloat(primarySentiment['ticker_sentiment_score']) || null : null,
      ticker_sentiment_label: primarySentiment ? primarySentiment['ticker_sentiment_label'] : null,
      ticker_relevance_score: primarySentiment ? parseFloat(primarySentiment['relevance_score']) || null : null,
      // Topics
      topics: (article['topics'] as unknown[])?.map((t: unknown) => {
        const topic = t as Record<string, string>;
        return {
          topic: topic['topic'],
          relevance_score: parseFloat(topic['relevance_score']) || null,
        };
      }) || [],
    };
  });
}

export const avGetNews = new DynamicStructuredTool({
  name: 'get_news',
  description: `Retrieves recent news articles from Alpha Vantage for a given company ticker, including sentiment analysis. Covers financial announcements, market trends, and other significant events. Useful for staying up-to-date with market-moving information and investor sentiment.`,
  schema: NewsInputSchema,
  func: async (input) => {
    const { data, url } = await callAlphaVantage({
      function: 'NEWS_SENTIMENT',
      tickers: input.ticker.toUpperCase(),
      time_from: formatDateForAV(input.start_date),
      time_to: formatDateForAV(input.end_date, true),
      limit: Math.min(input.limit, 200), // Alpha Vantage max is 200
      sort: 'LATEST',
    });
    
    const news = transformNews(data, input.limit);
    return formatToolResult(news, [url]);
  },
});
