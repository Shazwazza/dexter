# Alpha Vantage Integration Report for Dexter

## Executive Summary

This report analyzes options for adding Alpha Vantage support as an alternative financial data provider to Financial Datasets AI in Dexter. After researching both APIs, I recommend implementing Alpha Vantage as a **parallel provider** that can be used either instead of or alongside Financial Datasets, configurable via environment variables.

---

## Table of Contents

1. [Current Implementation Overview](#current-implementation-overview)
2. [Alpha Vantage API Analysis](#alpha-vantage-api-analysis)
3. [Feature Comparison](#feature-comparison)
4. [Implementation Options](#implementation-options)
5. [Recommended Approach](#recommended-approach)
6. [Implementation Guide](#implementation-guide)
7. [Risk Assessment](#risk-assessment)
8. [Appendix: API Endpoint Mapping](#appendix-api-endpoint-mapping)

---

## Current Implementation Overview

Dexter currently uses Financial Datasets AI (`api.financialdatasets.ai`) for all financial data. The implementation consists of:

### Core Files
- **`src/tools/finance/api.ts`** - Central API client with `callApi()` function
- **`src/tools/finance/fundamentals.ts`** - Income statements, balance sheets, cash flow
- **`src/tools/finance/prices.ts`** - Stock price data and snapshots
- **`src/tools/finance/filings.ts`** - SEC filings (10-K, 10-Q, 8-K)
- **`src/tools/finance/news.ts`** - Company news
- **`src/tools/finance/key-ratios.ts`** - Financial metrics and ratios
- **`src/tools/finance/estimates.ts`** - Analyst estimates
- **`src/tools/finance/insider_trades.ts`** - Insider trading data
- **`src/tools/finance/segments.ts`** - Segmented revenues
- **`src/tools/finance/company_facts.ts`** - Company metadata
- **`src/tools/finance/crypto.ts`** - Cryptocurrency prices

### Current Tools (18 total)
| Tool | Description |
|------|-------------|
| `get_income_statements` | Income statement data |
| `get_balance_sheets` | Balance sheet data |
| `get_cash_flow_statements` | Cash flow data |
| `get_all_financial_statements` | Combined financials |
| `get_filings` | SEC filing metadata |
| `get_10K_filing_items` | 10-K report sections |
| `get_10Q_filing_items` | 10-Q report sections |
| `get_8K_filing_items` | 8-K report sections |
| `get_price_snapshot` | Current stock price |
| `get_prices` | Historical prices |
| `get_key_ratios_snapshot` | Current financial metrics |
| `get_key_ratios` | Historical financial metrics |
| `get_news` | Company news |
| `get_analyst_estimates` | Analyst estimates |
| `get_segmented_revenues` | Revenue breakdown |
| `get_company_facts` | Company overview |
| `get_insider_trades` | Insider trading activity |
| `get_crypto_*` | Cryptocurrency data (3 tools) |

---

## Alpha Vantage API Analysis

### Overview
Alpha Vantage is a well-established financial data API founded in 2017, offering global market data across multiple asset classes.

### Key Features
- **Global Coverage**: Stocks from major exchanges worldwide (not just US)
- **Multi-Asset**: Stocks, ETFs, forex, crypto, commodities
- **Fundamental Data**: Income statements, balance sheets, cash flow, earnings
- **Technical Indicators**: 50+ indicators (MACD, RSI, etc.)
- **News & Sentiment**: Financial news with AI sentiment analysis
- **Options Data**: US options chains (premium)
- **Economic Indicators**: GDP, unemployment, inflation from FRED

### Pricing Tiers
| Plan | Rate Limit | Price |
|------|------------|-------|
| Free | 25 requests/day | $0 |
| Premium | 75+ requests/minute | $49.99+/month |
| Enterprise | Custom | Custom |

### API Format
Alpha Vantage uses a query-string based API:
```
https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=AAPL&apikey=YOUR_KEY
```

---

## Feature Comparison

| Feature | Financial Datasets AI | Alpha Vantage | Notes |
|---------|----------------------|---------------|-------|
| **Coverage** | US only | Global | AV has broader coverage |
| **Rate Limits** | 1,000/min (Dev) | 25/day (Free) | FD has higher limits |
| **Financial Statements** | ✅ Full | ✅ Full | Comparable |
| **SEC Filings** | ✅ Detailed with sections | ⚠️ Limited | FD is superior |
| **Insider Trading** | ✅ Form 4 data | ✅ Available | Comparable |
| **News** | ✅ With sentiment | ✅ With sentiment | Comparable |
| **Technical Indicators** | ❌ No | ✅ 50+ | AV exclusive |
| **Options Data** | ❌ No | ✅ (Premium) | AV exclusive |
| **Crypto** | ✅ Basic | ✅ Comprehensive | AV has more pairs |
| **Forex** | ❌ No | ✅ Full | AV exclusive |
| **Economic Data** | ⚠️ Limited | ✅ FRED data | AV is superior |
| **API Format** | REST JSON | REST JSON/CSV | Both work well |
| **Authentication** | API Key (header) | API Key (query) | Minor difference |

### Key Tradeoffs

**Advantages of Alpha Vantage:**
- Global stock coverage (not just US)
- Technical indicators (valuable for analysis)
- Forex data
- Economic indicators
- Options data (premium)
- More established, widely used

**Advantages of Financial Datasets:**
- Better SEC filing support (section extraction)
- Higher rate limits (1,000/min vs 25/day free)
- More detailed insider trading data
- Optimized for AI/LLM workflows

---

## Implementation Options

### Option 1: Full Replacement
Replace all Financial Datasets calls with Alpha Vantage equivalents.

**Pros:**
- Single data source
- Simpler maintenance
- Access to Alpha Vantage exclusives (forex, technical indicators)

**Cons:**
- Lose SEC filing section extraction
- Severe rate limit reduction on free tier (25/day vs 1,000/min)
- Not all features have 1:1 mapping

### Option 2: Parallel Provider (Recommended)
Add Alpha Vantage as an alternative provider, configurable via environment variables.

**Pros:**
- User choice based on needs
- Gradual migration possible
- Can use best features from each
- Maintains existing functionality

**Cons:**
- More code to maintain
- Some code duplication
- Configuration complexity

### Option 3: Hybrid Integration
Use Alpha Vantage for features not available in Financial Datasets (forex, technical indicators) while keeping Financial Datasets for existing features.

**Pros:**
- Best of both worlds
- No loss of existing functionality
- Access to unique Alpha Vantage features

**Cons:**
- Two API keys required
- Two rate limits to manage
- More complex implementation

---

## Recommended Approach

**Option 2: Parallel Provider** is recommended because:

1. **User Choice**: Users can pick the provider that fits their needs
2. **No Regression**: Existing Financial Datasets functionality preserved
3. **Flexible**: Can be extended to hybrid approach later
4. **Rate Limits**: Users on Alpha Vantage free tier face severe limits (25/day), so keeping Financial Datasets as an option is valuable

### Configuration Design
```bash
# In .env file
FINANCIAL_DATA_PROVIDER=financialdatasets  # or "alphavantage"
FINANCIAL_DATASETS_API_KEY=your-key
ALPHAVANTAGE_API_KEY=your-key
```

---

## Implementation Guide

### Phase 1: Create Alpha Vantage API Client

Create `src/tools/finance/alphavantage/api.ts`:
```typescript
const BASE_URL = 'https://www.alphavantage.co/query';

export async function callAlphaVantage(
  params: Record<string, string | number | undefined>
): Promise<{ data: Record<string, unknown>; url: string }> {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  const url = new URL(BASE_URL);
  
  url.searchParams.append('apikey', apiKey || '');
  
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  }

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`Alpha Vantage API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Alpha Vantage returns rate limit errors in JSON body
  if (data['Note'] || data['Information']) {
    throw new Error(data['Note'] || data['Information']);
  }

  return { data, url: url.toString() };
}
```

### Phase 2: Create Alpha Vantage Tool Implementations

Create equivalent tools in `src/tools/finance/alphavantage/`:
- `fundamentals.ts` - Using `INCOME_STATEMENT`, `BALANCE_SHEET`, `CASH_FLOW`
- `prices.ts` - Using `TIME_SERIES_DAILY`, `TIME_SERIES_INTRADAY`, `GLOBAL_QUOTE`
- `news.ts` - Using `NEWS_SENTIMENT`
- `overview.ts` - Using `OVERVIEW` (company info)
- `earnings.ts` - Using `EARNINGS`

### Phase 3: Create Provider Abstraction

Create `src/tools/finance/provider.ts`:
```typescript
export type FinanceProvider = 'financialdatasets' | 'alphavantage';

export function getFinanceProvider(): FinanceProvider {
  const provider = process.env.FINANCIAL_DATA_PROVIDER || 'financialdatasets';
  if (provider !== 'financialdatasets' && provider !== 'alphavantage') {
    console.warn(`Unknown provider: ${provider}, falling back to financialdatasets`);
    return 'financialdatasets';
  }
  return provider as FinanceProvider;
}
```

### Phase 4: Create Unified Tool Factory

Create unified tools that dispatch to the correct provider:
```typescript
export function createGetIncomeStatements() {
  const provider = getFinanceProvider();
  return provider === 'alphavantage' 
    ? alphaVantageGetIncomeStatements 
    : financialDatasetsGetIncomeStatements;
}
```

### Phase 5: Update Tool Registry

Modify `src/tools/finance/index.ts` to use the factory pattern.

### Phase 6: Update Environment Configuration

Update `env.example`:
```bash
# Financial Data Provider (choose one: financialdatasets or alphavantage)
FINANCIAL_DATA_PROVIDER=financialdatasets

# Financial Datasets API Key (if using financialdatasets)
FINANCIAL_DATASETS_API_KEY=your-api-key

# Alpha Vantage API Key (if using alphavantage)
ALPHAVANTAGE_API_KEY=your-api-key
```

### Phase 7: Add Alpha Vantage Exclusive Features (Optional)

Add new tools for Alpha Vantage-only features:
- `get_technical_indicator` - MACD, RSI, etc.
- `get_forex_rate` - Currency exchange rates
- `get_economic_indicator` - GDP, unemployment, etc.

---

## Risk Assessment

### High Risk
- **Rate Limits**: Alpha Vantage free tier (25/day) is very restrictive for agentic workflows. Premium is recommended.

### Medium Risk
- **Data Format Differences**: Alpha Vantage JSON structure differs from Financial Datasets. Normalization required.
- **Feature Gaps**: Some Financial Datasets features (SEC filing sections) don't have Alpha Vantage equivalents.

### Low Risk
- **API Stability**: Both APIs are mature and stable.
- **Code Complexity**: Factory pattern adds some complexity but is manageable.

---

## Appendix: API Endpoint Mapping

### Financial Statements
| Dexter Tool | Financial Datasets | Alpha Vantage |
|-------------|-------------------|---------------|
| `get_income_statements` | `/financials/income-statements/` | `function=INCOME_STATEMENT` |
| `get_balance_sheets` | `/financials/balance-sheets/` | `function=BALANCE_SHEET` |
| `get_cash_flow_statements` | `/financials/cash-flow-statements/` | `function=CASH_FLOW` |

### Price Data
| Dexter Tool | Financial Datasets | Alpha Vantage |
|-------------|-------------------|---------------|
| `get_price_snapshot` | `/prices/snapshot/` | `function=GLOBAL_QUOTE` |
| `get_prices` | `/prices/` | `function=TIME_SERIES_DAILY` |

### Company Info
| Dexter Tool | Financial Datasets | Alpha Vantage |
|-------------|-------------------|---------------|
| `get_company_facts` | `/company/facts` | `function=OVERVIEW` |
| `get_news` | `/news/` | `function=NEWS_SENTIMENT` |

### Not Directly Mappable (Financial Datasets only)
- `get_filings` - SEC filing metadata
- `get_10K_filing_items` - 10-K section extraction
- `get_10Q_filing_items` - 10-Q section extraction  
- `get_8K_filing_items` - 8-K section extraction
- `get_segmented_revenues` - Revenue segments

### Alpha Vantage Exclusive
- Technical indicators (50+)
- Forex rates
- Options chains (premium)
- Economic indicators (FRED data)

---

## Conclusion

Adding Alpha Vantage as a parallel provider offers the best balance of flexibility and functionality. Users can choose based on their needs:

- **Choose Financial Datasets** for: SEC filing analysis, high request volume, US-focused research
- **Choose Alpha Vantage** for: Global stocks, forex, technical indicators, economic data

**Estimated Implementation Effort**: 3-5 days for full parallel provider implementation, including tests.

**Recommendation**: Proceed with Phase 1-4 initially (core financial data), then add exclusive features (Phase 7) based on user feedback.
