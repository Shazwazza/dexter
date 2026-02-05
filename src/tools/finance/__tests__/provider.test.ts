/**
 * Unit tests for finance provider abstraction.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Finance Provider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getFinanceProvider', () => {
    it('should return "financialdatasets" by default', async () => {
      delete process.env.FINANCIAL_DATA_PROVIDER;
      const { getFinanceProvider } = await import('../provider.js');
      expect(getFinanceProvider()).toBe('financialdatasets');
    });

    it('should return "alphavantage" when configured', async () => {
      process.env.FINANCIAL_DATA_PROVIDER = 'alphavantage';
      const { getFinanceProvider } = await import('../provider.js');
      expect(getFinanceProvider()).toBe('alphavantage');
    });

    it('should return "financialdatasets" for invalid provider', async () => {
      process.env.FINANCIAL_DATA_PROVIDER = 'invalid';
      const { getFinanceProvider } = await import('../provider.js');
      expect(getFinanceProvider()).toBe('financialdatasets');
    });
  });

  describe('isProviderConfigured', () => {
    it('should return true for financialdatasets when API key exists', async () => {
      process.env.FINANCIAL_DATASETS_API_KEY = 'test-key';
      const { isProviderConfigured } = await import('../provider.js');
      expect(isProviderConfigured('financialdatasets')).toBe(true);
    });

    it('should return false for financialdatasets when API key missing', async () => {
      delete process.env.FINANCIAL_DATASETS_API_KEY;
      const { isProviderConfigured } = await import('../provider.js');
      expect(isProviderConfigured('financialdatasets')).toBe(false);
    });

    it('should return true for alphavantage when API key exists', async () => {
      process.env.ALPHAVANTAGE_API_KEY = 'test-key';
      const { isProviderConfigured } = await import('../provider.js');
      expect(isProviderConfigured('alphavantage')).toBe(true);
    });

    it('should return false for alphavantage when API key missing', async () => {
      delete process.env.ALPHAVANTAGE_API_KEY;
      const { isProviderConfigured } = await import('../provider.js');
      expect(isProviderConfigured('alphavantage')).toBe(false);
    });
  });
});
