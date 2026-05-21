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
export function calculatePortfolioStats(records, livePriceTarget, targetCurrency = 'THB', usdToThb = 36.5) {
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
    let amt = parseFloat(item.amount) || 0;

    if (origCurrency !== targetCurrency) {
      if (targetCurrency === 'USD') {
        amt = amt / usdToThb;
      } else {
        amt = amt * usdToThb;
      }
    }

    totalInvested += amt;
    totalSatoshi += parseInt(item.sat) || 0;
  });

  const totalBtc = totalSatoshi / SATOSHI_PER_BTC;
  const averagePrice = totalBtc > 0 ? totalInvested / totalBtc : 0;
  
  // Current portfolio valuation in the target currency
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
 * @param {string} targetCurrency - 'THB' | 'USD'
 * @param {number} usdToThb - Exchange rate
 * @returns {Array} Timeline of daily stats { date, principal, value }
 */
export function generateChartData(records, targetCurrency = 'THB', usdToThb = 36.5) {
  if (!records || records.length === 0) return [];

  // Sort records chronologically (oldest first)
  const sorted = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));

  const dailyPoints = {};
  let cumulativeSatoshi = 0;
  let cumulativePrincipal = 0;

  sorted.forEach(item => {
    const origCurrency = item.currency || 'THB';
    let amt = parseFloat(item.amount) || 0;
    let price = parseFloat(item.price) || 0;

    // Convert amount and price to target currency
    if (origCurrency !== targetCurrency) {
      if (targetCurrency === 'USD') {
        amt = amt / usdToThb;
        price = price / usdToThb;
      } else {
        amt = amt * usdToThb;
        price = price * usdToThb;
      }
    }

    cumulativePrincipal += amt;
    cumulativeSatoshi += parseInt(item.sat) || 0;

    const cumulativeBtc = cumulativeSatoshi / SATOSHI_PER_BTC;
    const portfolioValue = cumulativeBtc * price;

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
  return Math.round(btcValue * SATOSHI_PER_BTC);
}
