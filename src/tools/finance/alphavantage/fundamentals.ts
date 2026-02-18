/**
 * Alpha Vantage fundamental data tools.
 * Provides income statements, balance sheets, cash flow, and earnings.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { callAlphaVantage } from './api.js';
import { formatToolResult } from '../../types.js';

// Shared input schema for financial statements
const FinancialStatementsInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The stock ticker symbol to fetch financial statements for. For example, 'AAPL' for Apple."
    ),
  period: z
    .enum(['annual', 'quarterly', 'ttm'])
    .describe(
      "The reporting period for the financial statements. 'annual' for yearly, 'quarterly' for quarterly. Note: Alpha Vantage doesn't support 'ttm' directly, will return annual data."
    ),
  limit: z
    .number()
    .default(10)
    .describe(
      'Maximum number of report periods to return (default: 10). Returns the most recent N periods based on the period type.'
    ),
  // These date filters are supported by Financial Datasets but not Alpha Vantage
  // We'll accept them but ignore them for Alpha Vantage compatibility
  report_period_gt: z.string().optional().describe('(Ignored for Alpha Vantage) Filter by date.'),
  report_period_gte: z.string().optional().describe('(Ignored for Alpha Vantage) Filter by date.'),
  report_period_lt: z.string().optional().describe('(Ignored for Alpha Vantage) Filter by date.'),
  report_period_lte: z.string().optional().describe('(Ignored for Alpha Vantage) Filter by date.'),
});

/**
 * Transform Alpha Vantage income statement data to a normalized format.
 */
function transformIncomeStatements(data: Record<string, unknown>, period: string, limit: number): unknown[] {
  const key = period === 'quarterly' ? 'quarterlyReports' : 'annualReports';
  const reports = (data[key] as unknown[]) || [];
  return reports.slice(0, limit).map((report: unknown) => {
    const r = report as Record<string, string>;
    return {
      ticker: data['symbol'],
      report_period: r['fiscalDateEnding'],
      period: period === 'quarterly' ? 'quarterly' : 'annual',
      revenue: parseFloat(r['totalRevenue']) || null,
      cost_of_revenue: parseFloat(r['costOfRevenue']) || null,
      gross_profit: parseFloat(r['grossProfit']) || null,
      operating_income: parseFloat(r['operatingIncome']) || null,
      net_income: parseFloat(r['netIncome']) || null,
      eps_basic: parseFloat(r['reportedEPS']) || null,
      ebitda: parseFloat(r['ebitda']) || null,
      research_and_development: parseFloat(r['researchAndDevelopment']) || null,
      // Alpha Vantage specific fields
      interest_expense: parseFloat(r['interestExpense']) || null,
      income_before_tax: parseFloat(r['incomeBeforeTax']) || null,
      income_tax_expense: parseFloat(r['incomeTaxExpense']) || null,
    };
  });
}

/**
 * Transform Alpha Vantage balance sheet data to a normalized format.
 */
function transformBalanceSheets(data: Record<string, unknown>, period: string, limit: number): unknown[] {
  const key = period === 'quarterly' ? 'quarterlyReports' : 'annualReports';
  const reports = (data[key] as unknown[]) || [];
  return reports.slice(0, limit).map((report: unknown) => {
    const r = report as Record<string, string>;
    return {
      ticker: data['symbol'],
      report_period: r['fiscalDateEnding'],
      period: period === 'quarterly' ? 'quarterly' : 'annual',
      total_assets: parseFloat(r['totalAssets']) || null,
      total_liabilities: parseFloat(r['totalLiabilities']) || null,
      total_equity: parseFloat(r['totalShareholderEquity']) || null,
      cash_and_equivalents: parseFloat(r['cashAndCashEquivalentsAtCarryingValue']) || null,
      short_term_investments: parseFloat(r['shortTermInvestments']) || null,
      total_current_assets: parseFloat(r['totalCurrentAssets']) || null,
      total_current_liabilities: parseFloat(r['totalCurrentLiabilities']) || null,
      long_term_debt: parseFloat(r['longTermDebt']) || null,
      short_term_debt: parseFloat(r['shortTermDebt']) || null,
      retained_earnings: parseFloat(r['retainedEarnings']) || null,
      common_stock: parseFloat(r['commonStock']) || null,
      shares_outstanding: parseFloat(r['commonStockSharesOutstanding']) || null,
    };
  });
}

/**
 * Transform Alpha Vantage cash flow data to a normalized format.
 */
function transformCashFlowStatements(data: Record<string, unknown>, period: string, limit: number): unknown[] {
  const key = period === 'quarterly' ? 'quarterlyReports' : 'annualReports';
  const reports = (data[key] as unknown[]) || [];
  return reports.slice(0, limit).map((report: unknown) => {
    const r = report as Record<string, string>;
    const operatingCashFlow = parseFloat(r['operatingCashflow']) || 0;
    const capitalExpenditures = parseFloat(r['capitalExpenditures']) || 0;
    // Capital expenditures are typically negative in accounting convention,
    // Free cash flow = Operating cash flow - |Capital expenditures|
    // Handle both positive and negative capex values
    const absCapex = capitalExpenditures < 0 ? Math.abs(capitalExpenditures) : capitalExpenditures;
    
    return {
      ticker: data['symbol'],
      report_period: r['fiscalDateEnding'],
      period: period === 'quarterly' ? 'quarterly' : 'annual',
      operating_cash_flow: operatingCashFlow || null,
      investing_cash_flow: parseFloat(r['cashflowFromInvestment']) || null,
      financing_cash_flow: parseFloat(r['cashflowFromFinancing']) || null,
      capital_expenditures: capitalExpenditures || null,
      free_cash_flow: operatingCashFlow - absCapex,
      dividends_paid: parseFloat(r['dividendPayout']) || null,
      net_change_in_cash: parseFloat(r['changeInCashAndCashEquivalents']) || null,
      depreciation_and_amortization: parseFloat(r['depreciationDepletionAndAmortization']) || null,
    };
  });
}

export const avGetIncomeStatements = new DynamicStructuredTool({
  name: 'get_income_statements',
  description: `Fetches a company's income statements from Alpha Vantage, detailing its revenues, expenses, net income, etc. over a reporting period. Useful for evaluating a company's profitability and operational efficiency.`,
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const { data, url } = await callAlphaVantage({
      function: 'INCOME_STATEMENT',
      symbol: input.ticker.toUpperCase(),
    });
    
    const period = input.period === 'ttm' ? 'annual' : input.period;
    const statements = transformIncomeStatements(data, period, input.limit);
    
    return formatToolResult(statements, [url]);
  },
});

export const avGetBalanceSheets = new DynamicStructuredTool({
  name: 'get_balance_sheets',
  description: `Retrieves a company's balance sheets from Alpha Vantage, providing a snapshot of its assets, liabilities, shareholders' equity, etc. at a specific point in time. Useful for assessing a company's financial position.`,
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const { data, url } = await callAlphaVantage({
      function: 'BALANCE_SHEET',
      symbol: input.ticker.toUpperCase(),
    });
    
    const period = input.period === 'ttm' ? 'annual' : input.period;
    const statements = transformBalanceSheets(data, period, input.limit);
    
    return formatToolResult(statements, [url]);
  },
});

export const avGetCashFlowStatements = new DynamicStructuredTool({
  name: 'get_cash_flow_statements',
  description: `Retrieves a company's cash flow statements from Alpha Vantage, showing how cash is generated and used across operating, investing, and financing activities. Useful for understanding a company's liquidity and solvency.`,
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const { data, url } = await callAlphaVantage({
      function: 'CASH_FLOW',
      symbol: input.ticker.toUpperCase(),
    });
    
    const period = input.period === 'ttm' ? 'annual' : input.period;
    const statements = transformCashFlowStatements(data, period, input.limit);
    
    return formatToolResult(statements, [url]);
  },
});

export const avGetAllFinancialStatements = new DynamicStructuredTool({
  name: 'get_all_financial_statements',
  description: `Retrieves all three financial statements (income statements, balance sheets, and cash flow statements) from Alpha Vantage for a company. Note: This makes 3 separate API calls to Alpha Vantage.`,
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const period = input.period === 'ttm' ? 'annual' : input.period;
    const urls: string[] = [];
    
    // Fetch all three statements in parallel
    const [incomeResult, balanceResult, cashFlowResult] = await Promise.all([
      callAlphaVantage({ function: 'INCOME_STATEMENT', symbol: input.ticker.toUpperCase() }),
      callAlphaVantage({ function: 'BALANCE_SHEET', symbol: input.ticker.toUpperCase() }),
      callAlphaVantage({ function: 'CASH_FLOW', symbol: input.ticker.toUpperCase() }),
    ]);
    
    urls.push(incomeResult.url, balanceResult.url, cashFlowResult.url);
    
    const financials = {
      income_statements: transformIncomeStatements(incomeResult.data, period, input.limit),
      balance_sheets: transformBalanceSheets(balanceResult.data, period, input.limit),
      cash_flow_statements: transformCashFlowStatements(cashFlowResult.data, period, input.limit),
    };
    
    return formatToolResult(financials, urls);
  },
});
