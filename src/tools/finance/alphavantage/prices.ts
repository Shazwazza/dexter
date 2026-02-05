/**
 * Alpha Vantage price data tools.
 * Provides current quotes and historical price data.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callAlphaVantage } from './api.js';
import { formatToolResult } from '../../types.js';

const PriceSnapshotInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The stock ticker symbol to fetch the price snapshot for. For example, 'AAPL' for Apple."
    ),
});

/**
 * Transform Alpha Vantage GLOBAL_QUOTE to normalized snapshot format.
 */
function transformQuote(data: Record<string, unknown>, ticker: string): unknown {
  const quote = data['Global Quote'] as Record<string, string> | undefined;
  
  if (!quote) {
    return { error: 'No quote data returned' };
  }
  
  return {
    ticker: ticker.toUpperCase(),
    price: parseFloat(quote['05. price']) || null,
    open: parseFloat(quote['02. open']) || null,
    high: parseFloat(quote['03. high']) || null,
    low: parseFloat(quote['04. low']) || null,
    volume: parseInt(quote['06. volume']) || null,
    previous_close: parseFloat(quote['08. previous close']) || null,
    change: parseFloat(quote['09. change']) || null,
    change_percent: quote['10. change percent'] ? parseFloat(quote['10. change percent'].replace('%', '')) : null,
    latest_trading_day: quote['07. latest trading day'] || null,
  };
}

export const avGetPriceSnapshot = new DynamicStructuredTool({
  name: 'get_price_snapshot',
  description: `Fetches the most recent price snapshot from Alpha Vantage for a specific stock ticker, including the latest price, trading volume, and open, high, low, close price data.`,
  schema: PriceSnapshotInputSchema,
  func: async (input) => {
    const { data, url } = await callAlphaVantage({
      function: 'GLOBAL_QUOTE',
      symbol: input.ticker.toUpperCase(),
    });
    
    const snapshot = transformQuote(data, input.ticker);
    return formatToolResult(snapshot, [url]);
  },
});

const PricesInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The stock ticker symbol to fetch aggregated prices for. For example, 'AAPL' for Apple."
    ),
  interval: z
    .enum(['minute', 'day', 'week', 'month', 'year'])
    .default('day')
    .describe("The time interval for price data. Defaults to 'day'. Note: Alpha Vantage maps 'year' to monthly data."),
  interval_multiplier: z
    .number()
    .default(1)
    .describe('Multiplier for the interval. Defaults to 1. (Limited support in Alpha Vantage)'),
  start_date: z.string().describe('Start date in YYYY-MM-DD format. Must be in past. Required.'),
  end_date: z.string().describe('End date in YYYY-MM-DD format. Must be today or in the past. Required.'),
});

/**
 * Get the Alpha Vantage function based on interval.
 */
function getTimeSeriesFunction(interval: string): string {
  switch (interval) {
    case 'minute':
      return 'TIME_SERIES_INTRADAY';
    case 'day':
      return 'TIME_SERIES_DAILY';
    case 'week':
      return 'TIME_SERIES_WEEKLY';
    case 'month':
    case 'year':
      return 'TIME_SERIES_MONTHLY';
    default:
      return 'TIME_SERIES_DAILY';
  }
}

/**
 * Get the data key for the time series function.
 */
function getTimeSeriesKey(func: string, interval?: string): string {
  switch (func) {
    case 'TIME_SERIES_INTRADAY':
      return `Time Series (${interval || '5min'})`;
    case 'TIME_SERIES_DAILY':
      return 'Time Series (Daily)';
    case 'TIME_SERIES_WEEKLY':
      return 'Weekly Time Series';
    case 'TIME_SERIES_MONTHLY':
      return 'Monthly Time Series';
    default:
      return 'Time Series (Daily)';
  }
}

/**
 * Transform Alpha Vantage time series to normalized price format.
 */
function transformPrices(
  data: Record<string, unknown>,
  ticker: string,
  startDate: string,
  endDate: string,
  func: string,
  interval?: string
): unknown[] {
  const key = getTimeSeriesKey(func, interval);
  const timeSeries = data[key] as Record<string, Record<string, string>> | undefined;
  
  if (!timeSeries) {
    return [];
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return Object.entries(timeSeries)
    .filter(([date]) => {
      const d = new Date(date.split(' ')[0]); // Handle intraday timestamps
      return d >= start && d <= end;
    })
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([date, values]) => ({
      ticker: ticker.toUpperCase(),
      date: date.split(' ')[0], // Normalize to YYYY-MM-DD
      open: parseFloat(values['1. open']) || null,
      high: parseFloat(values['2. high']) || null,
      low: parseFloat(values['3. low']) || null,
      close: parseFloat(values['4. close']) || null,
      volume: parseInt(values['5. volume']) || null,
    }));
}

export const avGetPrices = new DynamicStructuredTool({
  name: 'get_prices',
  description: `Retrieves historical price data from Alpha Vantage for a stock over a specified date range, including open, high, low, close prices, and volume.`,
  schema: PricesInputSchema,
  func: async (input) => {
    const func = getTimeSeriesFunction(input.interval);
    
    const params: Record<string, string | number | undefined> = {
      function: func,
      symbol: input.ticker.toUpperCase(),
      outputsize: 'full', // Get full history for date filtering
    };
    
    // Add interval for intraday
    if (func === 'TIME_SERIES_INTRADAY') {
      // Alpha Vantage supports 1min, 5min, 15min, 30min, 60min
      // Use interval_multiplier as the minute value (default 1 from schema)
      const minutes = input.interval_multiplier;
      // Clamp to valid Alpha Vantage intervals
      const validIntervals = [1, 5, 15, 30, 60];
      const closestInterval = validIntervals.reduce((prev, curr) =>
        Math.abs(curr - minutes) < Math.abs(prev - minutes) ? curr : prev
      );
      params['interval'] = `${closestInterval}min`;
    }
    
    const { data, url } = await callAlphaVantage(params);
    
    const prices = transformPrices(
      data,
      input.ticker,
      input.start_date,
      input.end_date,
      func,
      params['interval'] as string | undefined
    );
    
    return formatToolResult(prices, [url]);
  },
});
