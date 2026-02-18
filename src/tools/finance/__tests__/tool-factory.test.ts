/**
 * Unit tests for finance tool factory.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('Finance Tool Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getFinanceTools', () => {
    it('should return Financial Datasets tools by default', async () => {
      delete process.env.FINANCIAL_DATA_PROVIDER;
      const { getFinanceTools } = await import('../tool-factory.js');
      
      const tools = getFinanceTools();
      
      // Should include Financial Datasets specific tools
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('get_income_statements');
      expect(toolNames).toContain('get_balance_sheets');
      expect(toolNames).toContain('get_price_snapshot');
      expect(toolNames).toContain('get_company_facts');
      // Financial Datasets exclusive tools
      expect(toolNames).toContain('get_insider_trades');
      expect(toolNames).toContain('get_segmented_revenues');
      expect(toolNames).toContain('get_key_ratios_snapshot');
    });

    it('should return Alpha Vantage tools when configured', async () => {
      process.env.FINANCIAL_DATA_PROVIDER = 'alphavantage';
      const { getFinanceTools } = await import('../tool-factory.js');
      
      const tools = getFinanceTools();
      
      // Should include common tools
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('get_income_statements');
      expect(toolNames).toContain('get_balance_sheets');
      expect(toolNames).toContain('get_price_snapshot');
      expect(toolNames).toContain('get_company_facts');
      expect(toolNames).toContain('get_news');
      expect(toolNames).toContain('get_analyst_estimates');
      
      // Should NOT include Financial Datasets exclusive tools
      expect(toolNames).not.toContain('get_insider_trades');
      expect(toolNames).not.toContain('get_segmented_revenues');
      expect(toolNames).not.toContain('get_key_ratios_snapshot');
    });
  });

  describe('getFinanceTool', () => {
    it('should return a specific tool by name', async () => {
      delete process.env.FINANCIAL_DATA_PROVIDER;
      const { getFinanceTool } = await import('../tool-factory.js');
      
      const tool = getFinanceTool('get_income_statements');
      
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('get_income_statements');
    });

    it('should return undefined for non-existent tool', async () => {
      const { getFinanceTool } = await import('../tool-factory.js');
      
      const tool = getFinanceTool('non_existent_tool');
      
      expect(tool).toBeUndefined();
    });
  });

  describe('getCurrentProvider', () => {
    it('should return current provider from environment', async () => {
      process.env.FINANCIAL_DATA_PROVIDER = 'alphavantage';
      const { getCurrentProvider } = await import('../tool-factory.js');
      
      expect(getCurrentProvider()).toBe('alphavantage');
    });
  });
});
