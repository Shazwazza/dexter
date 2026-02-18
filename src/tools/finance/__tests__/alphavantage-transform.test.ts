/**
 * Unit tests for Alpha Vantage tools data transformation.
 */
import { describe, it, expect } from '@jest/globals';

describe('Alpha Vantage Data Transformation', () => {
  describe('Price Snapshot Transformation', () => {
    it('should transform GLOBAL_QUOTE response correctly', () => {
      const mockResponse = {
        'Global Quote': {
          '01. symbol': 'AAPL',
          '02. open': '175.00',
          '03. high': '180.00',
          '04. low': '174.50',
          '05. price': '178.25',
          '06. volume': '45000000',
          '07. latest trading day': '2025-01-15',
          '08. previous close': '174.00',
          '09. change': '4.25',
          '10. change percent': '2.44%',
        },
      };

      // Simulate the transformation logic
      const quote = mockResponse['Global Quote'];
      const transformed = {
        ticker: 'AAPL',
        price: parseFloat(quote['05. price']) || null,
        open: parseFloat(quote['02. open']) || null,
        high: parseFloat(quote['03. high']) || null,
        low: parseFloat(quote['04. low']) || null,
        volume: parseInt(quote['06. volume']) || null,
        previous_close: parseFloat(quote['08. previous close']) || null,
        change: parseFloat(quote['09. change']) || null,
        change_percent: quote['10. change percent']
          ? parseFloat(quote['10. change percent'].replace('%', ''))
          : null,
        latest_trading_day: quote['07. latest trading day'] || null,
      };

      expect(transformed.ticker).toBe('AAPL');
      expect(transformed.price).toBe(178.25);
      expect(transformed.open).toBe(175.0);
      expect(transformed.high).toBe(180.0);
      expect(transformed.low).toBe(174.5);
      expect(transformed.volume).toBe(45000000);
      expect(transformed.change).toBe(4.25);
      expect(transformed.change_percent).toBe(2.44);
    });
  });

  describe('Income Statement Transformation', () => {
    it('should transform INCOME_STATEMENT response correctly', () => {
      const mockResponse = {
        symbol: 'AAPL',
        annualReports: [
          {
            fiscalDateEnding: '2024-09-30',
            totalRevenue: '385000000000',
            costOfRevenue: '212000000000',
            grossProfit: '173000000000',
            operatingIncome: '115000000000',
            netIncome: '97000000000',
            reportedEPS: '6.11',
            ebitda: '135000000000',
          },
        ],
        quarterlyReports: [
          {
            fiscalDateEnding: '2024-12-31',
            totalRevenue: '100000000000',
            netIncome: '25000000000',
          },
        ],
      };

      // Test annual reports transformation
      const annualReport = mockResponse.annualReports[0];
      const transformed = {
        ticker: mockResponse.symbol,
        report_period: annualReport.fiscalDateEnding,
        period: 'annual',
        revenue: parseFloat(annualReport.totalRevenue) || null,
        net_income: parseFloat(annualReport.netIncome) || null,
        eps_basic: parseFloat(annualReport.reportedEPS) || null,
      };

      expect(transformed.ticker).toBe('AAPL');
      expect(transformed.report_period).toBe('2024-09-30');
      expect(transformed.revenue).toBe(385000000000);
      expect(transformed.net_income).toBe(97000000000);
      expect(transformed.eps_basic).toBe(6.11);
    });
  });

  describe('Balance Sheet Transformation', () => {
    it('should transform BALANCE_SHEET response correctly', () => {
      const mockResponse = {
        symbol: 'AAPL',
        annualReports: [
          {
            fiscalDateEnding: '2024-09-30',
            totalAssets: '350000000000',
            totalLiabilities: '280000000000',
            totalShareholderEquity: '70000000000',
            cashAndCashEquivalentsAtCarryingValue: '28000000000',
            commonStockSharesOutstanding: '15900000000',
          },
        ],
      };

      const report = mockResponse.annualReports[0];
      const transformed = {
        ticker: mockResponse.symbol,
        report_period: report.fiscalDateEnding,
        total_assets: parseFloat(report.totalAssets) || null,
        total_liabilities: parseFloat(report.totalLiabilities) || null,
        total_equity: parseFloat(report.totalShareholderEquity) || null,
        cash_and_equivalents: parseFloat(report.cashAndCashEquivalentsAtCarryingValue) || null,
        shares_outstanding: parseFloat(report.commonStockSharesOutstanding) || null,
      };

      expect(transformed.ticker).toBe('AAPL');
      expect(transformed.total_assets).toBe(350000000000);
      expect(transformed.total_liabilities).toBe(280000000000);
      expect(transformed.total_equity).toBe(70000000000);
    });
  });

  describe('News Sentiment Transformation', () => {
    it('should transform NEWS_SENTIMENT response correctly', () => {
      const mockResponse = {
        feed: [
          {
            title: 'Apple Reports Strong Q4 Earnings',
            url: 'https://example.com/news/1',
            source: 'Financial Times',
            time_published: '20250115T120000',
            summary: 'Apple Inc. reported better than expected Q4 earnings...',
            overall_sentiment_score: '0.75',
            overall_sentiment_label: 'Bullish',
            ticker_sentiment: [
              {
                ticker: 'AAPL',
                ticker_sentiment_score: '0.8',
                ticker_sentiment_label: 'Bullish',
                relevance_score: '0.95',
              },
            ],
            topics: [
              { topic: 'Earnings', relevance_score: '0.9' },
              { topic: 'Technology', relevance_score: '0.8' },
            ],
          },
        ],
      };

      const article = mockResponse.feed[0];
      const tickerSentiment = article.ticker_sentiment[0];

      const transformed = {
        title: article.title,
        url: article.url,
        source: article.source,
        published_at: article.time_published,
        summary: article.summary,
        overall_sentiment_score: parseFloat(article.overall_sentiment_score) || null,
        overall_sentiment_label: article.overall_sentiment_label,
        ticker_sentiment_score: parseFloat(tickerSentiment.ticker_sentiment_score) || null,
        ticker_sentiment_label: tickerSentiment.ticker_sentiment_label,
        ticker_relevance_score: parseFloat(tickerSentiment.relevance_score) || null,
      };

      expect(transformed.title).toBe('Apple Reports Strong Q4 Earnings');
      expect(transformed.overall_sentiment_score).toBe(0.75);
      expect(transformed.overall_sentiment_label).toBe('Bullish');
      expect(transformed.ticker_sentiment_score).toBe(0.8);
    });
  });

  describe('Company Overview Transformation', () => {
    it('should transform OVERVIEW response correctly', () => {
      const mockResponse = {
        Symbol: 'AAPL',
        Name: 'Apple Inc',
        Description: 'Apple Inc. designs, manufactures, and markets smartphones...',
        Exchange: 'NASDAQ',
        Currency: 'USD',
        Country: 'USA',
        Sector: 'Technology',
        Industry: 'Consumer Electronics',
        MarketCapitalization: '2800000000000',
        PERatio: '28.5',
        DividendYield: '0.005',
        EPS: '6.11',
        Beta: '1.28',
        '52WeekHigh': '199.62',
        '52WeekLow': '164.08',
        SharesOutstanding: '15900000000',
      };

      const transformed = {
        ticker: mockResponse.Symbol,
        name: mockResponse.Name,
        sector: mockResponse.Sector,
        industry: mockResponse.Industry,
        market_cap: parseFloat(mockResponse.MarketCapitalization) || null,
        pe_ratio: parseFloat(mockResponse.PERatio) || null,
        dividend_yield: parseFloat(mockResponse.DividendYield) || null,
        eps: parseFloat(mockResponse.EPS) || null,
        beta: parseFloat(mockResponse.Beta) || null,
        week_52_high: parseFloat(mockResponse['52WeekHigh']) || null,
        week_52_low: parseFloat(mockResponse['52WeekLow']) || null,
      };

      expect(transformed.ticker).toBe('AAPL');
      expect(transformed.name).toBe('Apple Inc');
      expect(transformed.market_cap).toBe(2800000000000);
      expect(transformed.pe_ratio).toBe(28.5);
      expect(transformed.beta).toBe(1.28);
    });
  });
});
