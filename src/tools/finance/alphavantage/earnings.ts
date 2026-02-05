/**
 * Alpha Vantage earnings tool.
 * Provides earnings data and analyst estimates.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callAlphaVantage } from './api.js';
import { formatToolResult } from '../../types.js';

const AnalystEstimatesInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The stock ticker symbol to fetch analyst estimates for. For example, 'AAPL' for Apple."
    ),
  period: z
    .enum(['annual', 'quarterly'])
    .default('annual')
    .describe("The period for the estimates, either 'annual' or 'quarterly'."),
});

/**
 * Transform Alpha Vantage EARNINGS to normalized estimates format.
 */
function transformEarnings(data: Record<string, unknown>, period: string): unknown[] {
  const key = period === 'quarterly' ? 'quarterlyEarnings' : 'annualEarnings';
  const earnings = (data[key] as unknown[]) || [];
  
  return earnings.map((item: unknown) => {
    const e = item as Record<string, string>;
    
    if (period === 'quarterly') {
      return {
        ticker: data['symbol'],
        fiscal_date_ending: e['fiscalDateEnding'] || null,
        reported_date: e['reportedDate'] || null,
        reported_eps: parseFloat(e['reportedEPS']) || null,
        estimated_eps: parseFloat(e['estimatedEPS']) || null,
        surprise: parseFloat(e['surprise']) || null,
        surprise_percentage: parseFloat(e['surprisePercentage']) || null,
      };
    } else {
      return {
        ticker: data['symbol'],
        fiscal_date_ending: e['fiscalDateEnding'] || null,
        reported_eps: parseFloat(e['reportedEPS']) || null,
      };
    }
  });
}

export const avGetAnalystEstimates = new DynamicStructuredTool({
  name: 'get_analyst_estimates',
  description: `Retrieves earnings data and analyst estimates from Alpha Vantage for a given company ticker, including reported and estimated EPS, and surprise metrics. Useful for understanding consensus expectations, assessing future growth prospects, and performing valuation analysis.`,
  schema: AnalystEstimatesInputSchema,
  func: async (input) => {
    const { data, url } = await callAlphaVantage({
      function: 'EARNINGS',
      symbol: input.ticker.toUpperCase(),
    });
    
    const estimates = transformEarnings(data, input.period);
    return formatToolResult(estimates, [url]);
  },
});
