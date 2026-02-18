/**
 * Finance data provider abstraction.
 * Allows switching between Financial Datasets and Alpha Vantage.
 */

export type FinanceProvider = 'financialdatasets' | 'alphavantage';

/**
 * Get the configured finance provider from environment variables.
 * Defaults to 'financialdatasets' if not set or invalid.
 */
export function getFinanceProvider(): FinanceProvider {
  const provider = process.env.FINANCIAL_DATA_PROVIDER || 'financialdatasets';
  
  if (provider !== 'financialdatasets' && provider !== 'alphavantage') {
    console.warn(`Unknown finance provider: ${provider}, falling back to financialdatasets`);
    return 'financialdatasets';
  }
  
  return provider as FinanceProvider;
}

/**
 * Check if a specific provider is configured and has an API key.
 */
export function isProviderConfigured(provider: FinanceProvider): boolean {
  if (provider === 'financialdatasets') {
    return Boolean(process.env.FINANCIAL_DATASETS_API_KEY);
  }
  if (provider === 'alphavantage') {
    return Boolean(process.env.ALPHAVANTAGE_API_KEY);
  }
  return false;
}
