/**
 * Mathematical engine for logged DCA portfolio calculations.
 */

const SATOSHI_PER_BTC = 100000000;

/**
 * Calculates portfolio-wide metrics from custom transaction records.
 * 
 * @param {Array} records - Array of transaction items { date, amount, price, sat, currency }
 * @param {number} livePriceTarget - Real-time market price of BTC in the target display currency
 * @param {string} targetCurrency - 'THB' | 'USD'
 * @param {number} usdToThb - Exchange rate
 * @returns {object} Calculated stats for display
 */
export function calculatePortfolioStats(records, btcPriceUsd, targetCurrency = 'THB', rates = { USD: 1.0, THB: 36.5, AUD: 1.55, JPY: 155.0 }) {
  if (!records || records.length === 0) {
    return {
      totalInvested: 0,
      totalBtc: 0,
      averagePrice: 0,
      currentValue: 0,
      profitLoss: 0,
      profitLossPercent: 0,
      totalSatoshi: 0
    };
  }

  let totalInvested = 0;
  let totalSatoshi = 0;

  records.forEach(item => {
    const origCurrency = item.currency || 'THB';
    const amt = parseFloat(item.amount) || 0;

    // Convert from original logged currency to targetCurrency via USD
    const amtInUsd = amt / (rates[origCurrency] || 1.0);
    const amtInTarget = amtInUsd * (rates[targetCurrency] || 1.0);

    totalInvested += amtInTarget;
    totalSatoshi += parseInt(item.sat) || 0;
  });

  const totalBtc = totalSatoshi / SATOSHI_PER_BTC;
  const averagePrice = totalBtc > 0 ? totalInvested / totalBtc : 0;
  
  // Current portfolio valuation in the target currency
  const livePriceTarget = btcPriceUsd * (rates[targetCurrency] || 1.0);
  const currentValue = totalBtc * livePriceTarget;
  const profitLoss = currentValue - totalInvested;
  const profitLossPercent = totalInvested > 0 ? (profitLoss / totalInvested) * 100 : 0;

  return {
    totalInvested,
    totalBtc,
    averagePrice,
    currentValue,
    profitLoss,
    profitLossPercent,
    totalSatoshi
  };
}

/**
 * Compiles a chronological timeline of portfolio growth.
 * 
 * @param {Array} records - Array of transaction items
 * @param {string} targetCurrency - Active target currency ('THB' | 'USD' | 'AUD' | 'JPY')
 * @param {object} rates - Rates object relative to USD
 * @returns {Array} Timeline of daily stats { date, principal, value }
 */
export function generateChartData(records, targetCurrency = 'THB', rates = { USD: 1.0, THB: 36.5, AUD: 1.55, JPY: 155.0 }) {
  if (!records || records.length === 0) return [];

  // Sort records chronologically (oldest first)
  const sorted = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));

  const dailyPoints = {};
  let cumulativeSatoshi = 0;
  let cumulativePrincipal = 0;

  sorted.forEach(item => {
    const origCurrency = item.currency || 'THB';
    const amt = parseFloat(item.amount) || 0;
    const price = parseFloat(item.price) || 0;

    // Convert amount and price to target currency via USD
    const amtInUsd = amt / (rates[origCurrency] || 1.0);
    const amtInTarget = amtInUsd * (rates[targetCurrency] || 1.0);
    
    const priceInUsd = price / (rates[origCurrency] || 1.0);
    const priceInTarget = priceInUsd * (rates[targetCurrency] || 1.0);

    cumulativePrincipal += amtInTarget;
    cumulativeSatoshi += parseInt(item.sat) || 0;

    const cumulativeBtc = cumulativeSatoshi / SATOSHI_PER_BTC;
    const portfolioValue = cumulativeBtc * priceInTarget;

    dailyPoints[item.date] = {
      date: item.date,
      principal: parseFloat(cumulativePrincipal.toFixed(2)),
      value: parseFloat(portfolioValue.toFixed(2))
    };
  });

  // Convert dailyPoints object to sorted array of values
  return Object.values(dailyPoints).sort((a, b) => new Date(a.date) - new Date(b.date));
}


/**
 * Converts THB amount and purchase price to exact Satoshi count.
 * 
 * @param {number} amount - Invested amount in THB
 * @param {number} price - Purchase price in THB/BTC
 * @returns {number} Integer Satoshi value
 */
export function calculateSatoshis(amount, price) {
  if (amount <= 0 || price <= 0) return 0;
  const btcValue = amount / price;
  return Math.floor(btcValue * SATOSHI_PER_BTC);
}
