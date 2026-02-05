/**
 * Alpha Vantage API client.
 * https://www.alphavantage.co/documentation/
 */

const BASE_URL = 'https://www.alphavantage.co/query';

export interface AlphaVantageResponse {
  data: Record<string, unknown>;
  url: string;
}

/**
 * Make a request to the Alpha Vantage API.
 * 
 * @param params - Query parameters including the 'function' parameter
 * @returns The API response data and URL
 * @throws Error if the request fails or rate limit is hit
 */
export async function callAlphaVantage(
  params: Record<string, string | number | undefined>
): Promise<AlphaVantageResponse> {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  
  if (!apiKey) {
    throw new Error('ALPHAVANTAGE_API_KEY not found in environment variables');
  }

  const url = new URL(BASE_URL);
  
  // Add API key
  url.searchParams.append('apikey', apiKey);
  
  // Add other params
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  }

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`Alpha Vantage API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // Alpha Vantage returns rate limit and info messages in the response body
  if (data['Note']) {
    throw new Error(`Alpha Vantage rate limit: ${data['Note']}`);
  }
  if (data['Information']) {
    throw new Error(`Alpha Vantage info: ${data['Information']}`);
  }
  if (data['Error Message']) {
    throw new Error(`Alpha Vantage error: ${data['Error Message']}`);
  }

  return { data, url: url.toString() };
}
