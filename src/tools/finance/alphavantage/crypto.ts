/**
 * Alpha Vantage crypto data tools.
 * Provides cryptocurrency price data.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callAlphaVantage } from './api.js';
import { formatToolResult } from '../../types.js';

const CryptoPriceSnapshotInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The crypto ticker symbol to fetch the price snapshot for. Format: SYMBOL (e.g., 'BTC' for Bitcoin). Will be converted to SYMBOL/USD."
    ),
});

/**
 * Transform Alpha Vantage CURRENCY_EXCHANGE_RATE to normalized crypto snapshot format.
 */
function transformCryptoQuote(data: Record<string, unknown>, symbol: string): unknown {
  const quote = data['Realtime Currency Exchange Rate'] as Record<string, string> | undefined;
  
  if (!quote) {
    return { error: 'No quote data returned' };
  }
  
  return {
    ticker: `${symbol.toUpperCase()}-USD`,
    from_currency: quote['1. From_Currency Code'],
    to_currency: quote['3. To_Currency Code'],
    price: parseFloat(quote['5. Exchange Rate']) || null,
    bid_price: parseFloat(quote['8. Bid Price']) || null,
    ask_price: parseFloat(quote['9. Ask Price']) || null,
    last_refreshed: quote['6. Last Refreshed'] || null,
    timezone: quote['7. Time Zone'] || null,
  };
}

export const avGetCryptoPriceSnapshot = new DynamicStructuredTool({
  name: 'get_crypto_price_snapshot',
  description: `Fetches the most recent price snapshot from Alpha Vantage for a cryptocurrency in USD. Includes bid/ask prices.`,
  schema: CryptoPriceSnapshotInputSchema,
  func: async (input) => {
    // Extract the crypto symbol (handle both 'BTC' and 'BTC-USD' formats)
    const symbol = input.ticker.replace(/-.*$/, '').toUpperCase();
    
    const { data, url } = await callAlphaVantage({
      function: 'CURRENCY_EXCHANGE_RATE',
      from_currency: symbol,
      to_currency: 'USD',
    });
    
    const snapshot = transformCryptoQuote(data, symbol);
    return formatToolResult(snapshot, [url]);
  },
});

const CryptoPricesInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The crypto ticker symbol to fetch prices for. Format: SYMBOL (e.g., 'BTC' for Bitcoin)."
    ),
  interval: z
    .enum(['minute', 'day', 'week', 'month', 'year'])
    .default('day')
    .describe("The time interval for price data. Defaults to 'day'."),
  interval_multiplier: z
    .number()
    .default(1)
    .describe('Multiplier for the interval (limited support in Alpha Vantage).'),
  start_date: z.string().describe('Start date in YYYY-MM-DD format. Required.'),
  end_date: z.string().describe('End date in YYYY-MM-DD format. Required.'),
});

/**
 * Get the Alpha Vantage crypto function based on interval.
 */
function getCryptoFunction(interval: string): string {
  switch (interval) {
    case 'day':
      return 'DIGITAL_CURRENCY_DAILY';
    case 'week':
      return 'DIGITAL_CURRENCY_WEEKLY';
    case 'month':
    case 'year':
      return 'DIGITAL_CURRENCY_MONTHLY';
    default:
      return 'DIGITAL_CURRENCY_DAILY';
  }
}

/**
 * Get the data key for the crypto function.
 */
function getCryptoKey(func: string): string {
  switch (func) {
    case 'DIGITAL_CURRENCY_DAILY':
      return 'Time Series (Digital Currency Daily)';
    case 'DIGITAL_CURRENCY_WEEKLY':
      return 'Time Series (Digital Currency Weekly)';
    case 'DIGITAL_CURRENCY_MONTHLY':
      return 'Time Series (Digital Currency Monthly)';
    default:
      return 'Time Series (Digital Currency Daily)';
  }
}

/**
 * Transform Alpha Vantage crypto time series to normalized price format.
 */
function transformCryptoPrices(
  data: Record<string, unknown>,
  ticker: string,
  startDate: string,
  endDate: string,
  func: string
): unknown[] {
  const key = getCryptoKey(func);
  const timeSeries = data[key] as Record<string, Record<string, string>> | undefined;
  
  if (!timeSeries) {
    return [];
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return Object.entries(timeSeries)
    .filter(([date]) => {
      const d = new Date(date);
      return d >= start && d <= end;
    })
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([date, values]) => ({
      ticker: `${ticker.toUpperCase()}-USD`,
      date,
      open: parseFloat(values['1a. open (USD)']) || parseFloat(values['1. open']) || null,
      high: parseFloat(values['2a. high (USD)']) || parseFloat(values['2. high']) || null,
      low: parseFloat(values['3a. low (USD)']) || parseFloat(values['3. low']) || null,
      close: parseFloat(values['4a. close (USD)']) || parseFloat(values['4. close']) || null,
      volume: parseFloat(values['5. volume']) || null,
      market_cap: parseFloat(values['6. market cap (USD)']) || null,
    }));
}

export const avGetCryptoPrices = new DynamicStructuredTool({
  name: 'get_crypto_prices',
  description: `Retrieves historical price data from Alpha Vantage for a cryptocurrency in USD over a specified date range.`,
  schema: CryptoPricesInputSchema,
  func: async (input) => {
    const symbol = input.ticker.replace(/-.*$/, '').toUpperCase();
    const func = getCryptoFunction(input.interval);
    
    const { data, url } = await callAlphaVantage({
      function: func,
      symbol: symbol,
      market: 'USD',
    });
    
    const prices = transformCryptoPrices(data, symbol, input.start_date, input.end_date, func);
    return formatToolResult(prices, [url]);
  },
});

export const avGetCryptoTickers = new DynamicStructuredTool({
  name: 'get_available_crypto_tickers',
  description: `Returns a list of commonly available cryptocurrency tickers for Alpha Vantage. Note: Alpha Vantage doesn't have a dedicated endpoint for this, so this returns a curated list.`,
  schema: z.object({}),
  func: async () => {
    // Alpha Vantage doesn't have a tickers endpoint, so return common cryptos
    const tickers = [
      { symbol: 'BTC', name: 'Bitcoin' },
      { symbol: 'ETH', name: 'Ethereum' },
      { symbol: 'XRP', name: 'Ripple' },
      { symbol: 'LTC', name: 'Litecoin' },
      { symbol: 'BCH', name: 'Bitcoin Cash' },
      { symbol: 'ADA', name: 'Cardano' },
      { symbol: 'DOT', name: 'Polkadot' },
      { symbol: 'LINK', name: 'Chainlink' },
      { symbol: 'BNB', name: 'Binance Coin' },
      { symbol: 'SOL', name: 'Solana' },
      { symbol: 'DOGE', name: 'Dogecoin' },
      { symbol: 'MATIC', name: 'Polygon' },
      { symbol: 'AVAX', name: 'Avalanche' },
      { symbol: 'UNI', name: 'Uniswap' },
      { symbol: 'ATOM', name: 'Cosmos' },
    ];
    return formatToolResult(tickers, []);
  },
});
