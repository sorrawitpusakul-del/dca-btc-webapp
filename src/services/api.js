/**
 * API Service for live BTC prices and USD/THB exchange rates.
 */

const CRYPTOCOMPARE_PRICE_URL = 'https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD';
const EXCHANGE_RATE_URL = 'https://open.er-api.com/v6/latest/USD';

// Fail-safe fallbacks
const DEFAULT_USD_TO_THB = 36.5;

/**
 * Fetch the latest live BTC price in USD with backup fallbacks.
 * @returns {Promise<number|null>} BTC price in USD
 */
export async function fetchLiveBtcPrice() {
  // Try CryptoCompare first
  try {
    const response = await fetch(CRYPTOCOMPARE_PRICE_URL);
    if (response.ok) {
      const data = await response.json();
      if (data.USD) return parseFloat(data.USD);
    }
  } catch (e) {
    console.warn('CryptoCompare fetch failed, trying Coinbase backup:', e);
  }

  // Fallback 1: Coinbase spot price API
  try {
    const response = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
    if (response.ok) {
      const data = await response.json();
      if (data && data.data && data.data.amount) {
        return parseFloat(data.data.amount);
      }
    }
  } catch (e) {
    console.warn('Coinbase backup fetch failed, trying Blockchain.info backup:', e);
  }

  // Fallback 2: Blockchain.info ticker API
  try {
    const response = await fetch('https://blockchain.info/ticker');
    if (response.ok) {
      const data = await response.json();
      if (data && data.USD && data.USD.last) {
        return parseFloat(data.USD.last);
      }
    }
  } catch (e) {
    console.warn('Blockchain.info backup fetch failed:', e);
  }

  return null; // Will trigger engine to use local default values or last known rates
}

/**
 * Fetch the latest USD/THB exchange rate with backups.
 * @returns {Promise<number>} Exchange rate
 */
export async function fetchExchangeRateThb() {
  // Try primary Exchange Rate API
  try {
    const response = await fetch(EXCHANGE_RATE_URL);
    if (response.ok) {
      const data = await response.json();
      if (data.rates && data.rates.THB) return parseFloat(data.rates.THB);
    }
  } catch (e) {
    console.warn('Primary exchange rate fetch failed, trying backup API:', e);
  }

  // Fallback 1: exchangerate-api.com
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (response.ok) {
      const data = await response.json();
      if (data.rates && data.rates.THB) return parseFloat(data.rates.THB);
    }
  } catch (e) {
    console.warn('Second exchange rate backup failed, trying third API:', e);
  }

  // Fallback 2: Fawaz Ahmed\'s CDN currency API
  try {
    const response = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
    if (response.ok) {
      const data = await response.json();
      if (data && data.usd && data.usd.thb) {
        return parseFloat(data.usd.thb);
      }
    }
  } catch (e) {
    console.warn('All exchange rate backups failed, using default fallback:', e);
  }

  return DEFAULT_USD_TO_THB;
}

/**
 * Fetch live data in parallel.
 * @returns {Promise<{ btcPriceUsd: number|null, usdToThb: number }>}
 */
export async function fetchLiveData() {
  const [btcPriceUsd, usdToThb] = await Promise.all([
    fetchLiveBtcPrice(),
    fetchExchangeRateThb()
  ]);

  return { btcPriceUsd, usdToThb };
}
