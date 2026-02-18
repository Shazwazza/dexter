/**
 * Alpha Vantage company overview tool.
 * Provides company metadata and key metrics.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callAlphaVantage } from './api.js';
import { formatToolResult } from '../../types.js';

const CompanyFactsInputSchema = z.object({
  ticker: z
    .string()
    .describe("The stock ticker symbol to fetch company facts for. For example, 'AAPL' for Apple."),
});

/**
 * Transform Alpha Vantage OVERVIEW to normalized company facts format.
 */
function transformOverview(data: Record<string, string>): unknown {
  return {
    ticker: data['Symbol'] || null,
    name: data['Name'] || null,
    description: data['Description'] || null,
    exchange: data['Exchange'] || null,
    currency: data['Currency'] || null,
    country: data['Country'] || null,
    sector: data['Sector'] || null,
    industry: data['Industry'] || null,
    address: data['Address'] || null,
    fiscal_year_end: data['FiscalYearEnd'] || null,
    latest_quarter: data['LatestQuarter'] || null,
    market_cap: parseFloat(data['MarketCapitalization']) || null,
    ebitda: parseFloat(data['EBITDA']) || null,
    pe_ratio: parseFloat(data['PERatio']) || null,
    peg_ratio: parseFloat(data['PEGRatio']) || null,
    book_value: parseFloat(data['BookValue']) || null,
    dividend_per_share: parseFloat(data['DividendPerShare']) || null,
    dividend_yield: parseFloat(data['DividendYield']) || null,
    eps: parseFloat(data['EPS']) || null,
    revenue_per_share_ttm: parseFloat(data['RevenuePerShareTTM']) || null,
    profit_margin: parseFloat(data['ProfitMargin']) || null,
    operating_margin_ttm: parseFloat(data['OperatingMarginTTM']) || null,
    return_on_assets_ttm: parseFloat(data['ReturnOnAssetsTTM']) || null,
    return_on_equity_ttm: parseFloat(data['ReturnOnEquityTTM']) || null,
    revenue_ttm: parseFloat(data['RevenueTTM']) || null,
    gross_profit_ttm: parseFloat(data['GrossProfitTTM']) || null,
    shares_outstanding: parseFloat(data['SharesOutstanding']) || null,
    beta: parseFloat(data['Beta']) || null,
    week_52_high: parseFloat(data['52WeekHigh']) || null,
    week_52_low: parseFloat(data['52WeekLow']) || null,
    day_50_moving_average: parseFloat(data['50DayMovingAverage']) || null,
    day_200_moving_average: parseFloat(data['200DayMovingAverage']) || null,
    analyst_target_price: parseFloat(data['AnalystTargetPrice']) || null,
    analyst_rating_strong_buy: parseInt(data['AnalystRatingStrongBuy']) || null,
    analyst_rating_buy: parseInt(data['AnalystRatingBuy']) || null,
    analyst_rating_hold: parseInt(data['AnalystRatingHold']) || null,
    analyst_rating_sell: parseInt(data['AnalystRatingSell']) || null,
    analyst_rating_strong_sell: parseInt(data['AnalystRatingStrongSell']) || null,
  };
}

export const avGetCompanyFacts = new DynamicStructuredTool({
  name: 'get_company_facts',
  description: `Retrieves company facts and metadata from Alpha Vantage for a given ticker, including sector, industry, market cap, P/E ratio, dividend yield, analyst ratings, and more. Useful for getting an overview of a company's profile and basic information.`,
  schema: CompanyFactsInputSchema,
  func: async (input) => {
    const { data, url } = await callAlphaVantage({
      function: 'OVERVIEW',
      symbol: input.ticker.toUpperCase(),
    });
    
    const facts = transformOverview(data as Record<string, string>);
    return formatToolResult(facts, [url]);
  },
});
