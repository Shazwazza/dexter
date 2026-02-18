/**
 * Unit tests for Alpha Vantage API client.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Store original fetch
const originalFetch = global.fetch;

describe('Alpha Vantage API', () => {
  const originalEnv = process.env;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockFetch: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.ALPHAVANTAGE_API_KEY = 'test-api-key';
    
    // Create mock fetch for each test
    mockFetch = jest.fn();
    (global as Record<string, unknown>).fetch = mockFetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  describe('callAlphaVantage', () => {
    it('should make request with correct URL structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 'Global Quote': { '05. price': '150.00' } }),
      } as unknown as Response);

      const { callAlphaVantage } = await import('../alphavantage/api.js');
      
      await callAlphaVantage({
        function: 'GLOBAL_QUOTE',
        symbol: 'AAPL',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('https://www.alphavantage.co/query');
      expect(calledUrl).toContain('apikey=test-api-key');
      expect(calledUrl).toContain('function=GLOBAL_QUOTE');
      expect(calledUrl).toContain('symbol=AAPL');
    });

    it('should throw error when API key is missing', async () => {
      delete process.env.ALPHAVANTAGE_API_KEY;
      const { callAlphaVantage } = await import('../alphavantage/api.js');

      await expect(
        callAlphaVantage({ function: 'GLOBAL_QUOTE', symbol: 'AAPL' })
      ).rejects.toThrow('ALPHAVANTAGE_API_KEY not found');
    });

    it('should throw error on rate limit response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Note: 'Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute.',
        }),
      } as unknown as Response);

      const { callAlphaVantage } = await import('../alphavantage/api.js');

      await expect(
        callAlphaVantage({ function: 'GLOBAL_QUOTE', symbol: 'AAPL' })
      ).rejects.toThrow('Alpha Vantage rate limit');
    });

    it('should throw error on API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          'Error Message': 'Invalid API call',
        }),
      } as unknown as Response);

      const { callAlphaVantage } = await import('../alphavantage/api.js');

      await expect(
        callAlphaVantage({ function: 'INVALID', symbol: 'AAPL' })
      ).rejects.toThrow('Alpha Vantage error: Invalid API call');
    });

    it('should throw error on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as unknown as Response);

      const { callAlphaVantage } = await import('../alphavantage/api.js');

      await expect(
        callAlphaVantage({ function: 'GLOBAL_QUOTE', symbol: 'AAPL' })
      ).rejects.toThrow('Alpha Vantage API error: 500');
    });

    it('should return data and URL on success', async () => {
      const mockData = {
        'Global Quote': {
          '01. symbol': 'AAPL',
          '05. price': '175.50',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
      } as unknown as Response);

      const { callAlphaVantage } = await import('../alphavantage/api.js');
      
      const result = await callAlphaVantage({
        function: 'GLOBAL_QUOTE',
        symbol: 'AAPL',
      });

      expect(result.data).toEqual(mockData);
      expect(result.url).toContain('alphavantage.co');
    });
  });
});
