/**
 * Finance tool factory.
 * Returns the appropriate tools based on the configured provider.
 */

import { StructuredToolInterface } from '@langchain/core/tools';
import { getFinanceProvider, type FinanceProvider } from './provider.js';

// Financial Datasets tools
import {
  getIncomeStatements as fdGetIncomeStatements,
  getBalanceSheets as fdGetBalanceSheets,
  getCashFlowStatements as fdGetCashFlowStatements,
  getAllFinancialStatements as fdGetAllFinancialStatements,
} from './fundamentals.js';
import {
  getPriceSnapshot as fdGetPriceSnapshot,
  getPrices as fdGetPrices,
} from './prices.js';
import {
  getKeyRatiosSnapshot as fdGetKeyRatiosSnapshot,
  getKeyRatios as fdGetKeyRatios,
} from './key-ratios.js';
import { getNews as fdGetNews } from './news.js';
import { getAnalystEstimates as fdGetAnalystEstimates } from './estimates.js';
import { getSegmentedRevenues as fdGetSegmentedRevenues } from './segments.js';
import {
  getCryptoPriceSnapshot as fdGetCryptoPriceSnapshot,
  getCryptoPrices as fdGetCryptoPrices,
  getCryptoTickers as fdGetCryptoTickers,
} from './crypto.js';
import { getInsiderTrades as fdGetInsiderTrades } from './insider_trades.js';
import { getCompanyFacts as fdGetCompanyFacts } from './company_facts.js';

// Alpha Vantage tools
import {
  avGetIncomeStatements,
  avGetBalanceSheets,
  avGetCashFlowStatements,
  avGetAllFinancialStatements,
  avGetPriceSnapshot,
  avGetPrices,
  avGetCompanyFacts,
  avGetNews,
  avGetAnalystEstimates,
  avGetCryptoPriceSnapshot,
  avGetCryptoPrices,
  avGetCryptoTickers,
} from './alphavantage/index.js';

/**
 * Get all available finance tools for the current provider.
 * Some tools are only available with Financial Datasets (SEC filings, insider trades, segmented revenues).
 */
export function getFinanceTools(): StructuredToolInterface[] {
  const provider = getFinanceProvider();
  
  if (provider === 'alphavantage') {
    return [
      // Price Data
      avGetPriceSnapshot,
      avGetPrices,
      avGetCryptoPriceSnapshot,
      avGetCryptoPrices,
      avGetCryptoTickers,
      // Fundamentals
      avGetIncomeStatements,
      avGetBalanceSheets,
      avGetCashFlowStatements,
      avGetAllFinancialStatements,
      // Estimates
      avGetAnalystEstimates,
      // Other Data
      avGetNews,
      avGetCompanyFacts,
      // Note: Key ratios, insider trades, SEC filings, segmented revenues
      // are not available in Alpha Vantage - company overview has some metrics
    ];
  }
  
  // Default: Financial Datasets
  return [
    // Price Data
    fdGetPriceSnapshot,
    fdGetPrices,
    fdGetCryptoPriceSnapshot,
    fdGetCryptoPrices,
    fdGetCryptoTickers,
    // Fundamentals
    fdGetIncomeStatements,
    fdGetBalanceSheets,
    fdGetCashFlowStatements,
    fdGetAllFinancialStatements,
    // Key Ratios & Estimates
    fdGetKeyRatiosSnapshot,
    fdGetKeyRatios,
    fdGetAnalystEstimates,
    // Other Data
    fdGetNews,
    fdGetInsiderTrades,
    fdGetSegmentedRevenues,
    fdGetCompanyFacts,
  ];
}

/**
 * Get a specific tool by name for the current provider.
 */
export function getFinanceTool(name: string): StructuredToolInterface | undefined {
  const tools = getFinanceTools();
  return tools.find(t => t.name === name);
}

/**
 * Get the current finance provider name.
 */
export function getCurrentProvider(): FinanceProvider {
  return getFinanceProvider();
}
