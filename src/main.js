import './style.css';
import { inject } from '@vercel/analytics';
import { calculatePortfolioStats, calculateSatoshis, generateChartData } from './services/dcaEngine.js';
import { fetchLiveData } from './services/api.js';
import ApexCharts from 'apexcharts';

// Initialize Vercel Web Analytics
inject();

// Register Service Worker for PWA Standalone & Offline Capabilities
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('PWA Service Worker registered successfully:', reg.scope);
      })
      .catch(err => {
        console.warn('PWA Service Worker registration failed:', err);
      });
  });
}

// Application State
let state = {
  records: [],
  targetBtc: 1.0,
  livePriceThb: 2500000,
  livePriceUsd: 75000,
  usdToThb: 36.5,
  displayCurrency: 'THB',
  privacyMode: false,
  portfolioName: 'BTC DCA Portfolio',
  activeTheme: 'dark' // 'dark' (classic space blue-black) or 'pitch-black' (premium AMOLED)
};

// ApexCharts Instance
let chartInstance = null;

// DOM Elements
const elLiveBtcThb = document.getElementById('live-btc-thb');
const elLiveBtcUsd = document.getElementById('live-btc-usd');
const elToggleVisibilityBtn = document.getElementById('toggle-visibility-btn');
const elEyeIcon = document.getElementById('eye-icon');
const elSettingsTriggerBtn = document.getElementById('settings-trigger-btn');
const elSettingsModal = document.getElementById('settings-modal');
const elSettingsCloseBtn = document.getElementById('settings-close-btn');

// Target Displays
const elAccumulatedBtcDisplay = document.getElementById('accumulated-btc-display');
const elTargetBtcDisplay = document.getElementById('target-btc-display');
const elProgressBarFill = document.getElementById('progress-bar-fill');
const elRemainingBtcDisplay = document.getElementById('remaining-btc-display');
const elProgressPercentBadge = document.getElementById('progress-percent-badge');

// Stats Cards
const elCurrentValueDisplay = document.getElementById('current-value-display');
const elRefPriceDisplay = document.getElementById('ref-price-display');
const elTotalCostDisplay = document.getElementById('total-cost-display');
const elAvgPriceDisplay = document.getElementById('avg-price-display');
const elProfitLossDisplay = document.getElementById('profit-loss-display');
const elProfitLossPercent = document.getElementById('profit-loss-percent');
const elProfitLossCard = document.getElementById('profit-loss-card');

// Satoshi Card
const elTotalSatoshiDisplay = document.getElementById('total-satoshi-display');

// Logger Form
const elDcaForm = document.getElementById('dca-log-form');
const elInputDate = document.getElementById('input-date');
const elInputAmount = document.getElementById('input-amount');
const elInputPrice = document.getElementById('input-price');
const elInputSat = document.getElementById('input-sat');

// Ledger Table
const elLedgerBody = document.getElementById('ledger-table-body');

// Settings Fields
const elAppPortfolioTitle = document.getElementById('app-portfolio-title');
const elSettingPortfolioName = document.getElementById('setting-portfolio-name');
const elSettingTargetBtc = document.getElementById('setting-target-btc');
const elExportBackupBtn = document.getElementById('export-backup-btn');
const elImportBackupTriggerBtn = document.getElementById('import-backup-trigger-btn');
const elImportFileInput = document.getElementById('import-file-input');
const elImportCsvTriggerBtn = document.getElementById('import-csv-trigger-btn');
const elImportCsvInput = document.getElementById('import-csv-input');
const elClearAllDataBtn = document.getElementById('clear-all-data-btn');

/**
 * Save state preferences and records to localStorage.
 */
function saveStateToStorage() {
  localStorage.setItem('dca_portfolio_records', JSON.stringify(state.records));
  localStorage.setItem('dca_portfolio_target', state.targetBtc.toString());
  localStorage.setItem('dca_portfolio_privacy', state.privacyMode.toString());
  localStorage.setItem('dca_portfolio_currency', state.displayCurrency);
  localStorage.setItem('dca_portfolio_name', state.portfolioName);
  localStorage.setItem('dca_portfolio_theme', state.activeTheme);
}

/**
 * Update the DOM theme classes and button icons based on activeTheme.
 */
function updateThemeView() {
  const elToggleThemeBtn = document.getElementById('toggle-theme-btn');
  const elThemeIcon = document.getElementById('theme-icon');
  
  if (state.activeTheme === 'pitch-black') {
    document.body.classList.add('theme-pitch-black');
    if (elToggleThemeBtn) {
      elToggleThemeBtn.classList.add('active');
      elToggleThemeBtn.title = "สลับธีม ดำสนิท (Pitch Black) / มืดหรูหรา (Deep Slate)";
    }
    if (elThemeIcon) {
      elThemeIcon.innerHTML = `
        <circle cx="12" cy="12" r="10" fill="currentColor"></circle>
        <path d="M12 2a10 10 0 0 0 0 20V2z" fill="#000"></path>
      `;
    }
  } else {
    document.body.classList.remove('theme-pitch-black');
    if (elToggleThemeBtn) {
      elToggleThemeBtn.classList.remove('active');
      elToggleThemeBtn.title = "สลับธีม มืดหรูหรา / ดำสนิท (Pitch Black)";
    }
    if (elThemeIcon) {
      elThemeIcon.innerHTML = `
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 2a10 10 0 0 0 0 20V2z"></path>
      `;
    }
  }
}

/**
 * Toggle active theme and save.
 */
function toggleThemeMode() {
  state.activeTheme = state.activeTheme === 'dark' ? 'pitch-black' : 'dark';
  saveStateToStorage();
  updateThemeView();
  
  // Re-render chart to ensure ApexCharts markers/grid lines adapt to the new theme
  renderChart();

  // If share modal canvas is open, re-render it
  const elShareModal = document.getElementById('share-modal');
  if (elShareModal && elShareModal.classList.contains('active')) {
    updateShareCardCanvas();
  }
}

/**
 * Load preferences and records from localStorage.
 */
function loadStateFromStorage() {
  const savedRecords = localStorage.getItem('dca_portfolio_records');
  if (savedRecords) {
    try {
      state.records = JSON.parse(savedRecords);
    } catch (e) {
      console.error('Error loading saved records:', e);
      state.records = [];
    }
  }

  const savedTarget = localStorage.getItem('dca_portfolio_target');
  if (savedTarget) {
    state.targetBtc = parseFloat(savedTarget) || 1.0;
  }

  const savedPrivacy = localStorage.getItem('dca_portfolio_privacy');
  state.privacyMode = savedPrivacy === 'true';

  const savedCurrency = localStorage.getItem('dca_portfolio_currency');
  if (savedCurrency === 'USD' || savedCurrency === 'THB') {
    state.displayCurrency = savedCurrency;
  }

  const savedName = localStorage.getItem('dca_portfolio_name');
  if (savedName) {
    state.portfolioName = savedName;
  } else {
    state.portfolioName = 'BTC DCA Portfolio';
  }

  const savedTheme = localStorage.getItem('dca_portfolio_theme');
  if (savedTheme === 'dark' || savedTheme === 'pitch-black') {
    state.activeTheme = savedTheme;
  } else {
    state.activeTheme = 'dark';
  }
  
  // Apply theme immediately to body
  updateThemeView();
  
  // Set in DOM elements
  if (elAppPortfolioTitle) {
    elAppPortfolioTitle.textContent = state.portfolioName;
  }
  if (elSettingPortfolioName) {
    elSettingPortfolioName.value = state.portfolioName;
  }
  
  // Pre-fill the share modal title if available
  const elSharePortfolioTitle = document.getElementById('share-portfolio-title');
  if (elSharePortfolioTitle) {
    elSharePortfolioTitle.value = state.portfolioName;
  }

  // Update active toggle pill indicator immediately on load
  const elCurrencyThbBtn = document.getElementById('currency-thb-btn');
  const elCurrencyUsdBtn = document.getElementById('currency-usd-btn');
  if (elCurrencyThbBtn && elCurrencyUsdBtn) {
    if (state.displayCurrency === 'USD') {
      elCurrencyUsdBtn.classList.add('active');
      elCurrencyThbBtn.classList.remove('active');
    } else {
      elCurrencyThbBtn.classList.add('active');
      elCurrencyUsdBtn.classList.remove('active');
    }
  }

  // Apply privacy state immediately
  updatePrivacyView();
}

/**
 * Format numbers as THB or USD currency text.
 */
function formatCurrency(value, currency = state.displayCurrency) {
  const symbol = currency === 'USD' ? '$' : '฿';
  return symbol + parseFloat(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Format dynamic stats value that respects privacy toggle.
 */
function displayVal(value, type = 'currency') {
  if (state.privacyMode) return '••••••';
  if (type === 'btc') return parseFloat(value).toFixed(8);
  if (type === 'satoshi') return parseInt(value).toLocaleString('en-US');
  return formatCurrency(value);
}

/**
 * Toggle balance visibility (eye button).
 */
function togglePrivacyMode() {
  state.privacyMode = !state.privacyMode;
  saveStateToStorage();
  updatePrivacyView();
  renderUi();
}

function updatePrivacyView() {
  if (state.privacyMode) {
    elEyeIcon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    `;
    elToggleVisibilityBtn.classList.add('active');
  } else {
    elEyeIcon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `;
    elToggleVisibilityBtn.classList.remove('active');
  }
}

/**
 * Load API Market Prices (THB & USD)
 */
async function loadMarketPrices() {
  try {
    const { btcPriceUsd, usdToThb } = await fetchLiveData();
    if (btcPriceUsd && usdToThb) {
      state.livePriceUsd = btcPriceUsd;
      state.livePriceThb = btcPriceUsd * usdToThb;
      state.usdToThb = usdToThb;
      
      // Update displays
      elLiveBtcThb.innerText = formatCurrency(state.livePriceThb, 'THB');
      elLiveBtcUsd.innerText = '$' + btcPriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2 });
      
      // If adding new, pre-fill form purchase price with live price based on current display currency
      const livePricePrefill = state.displayCurrency === 'USD' ? state.livePriceUsd : state.livePriceThb;
      if (!elInputPrice.value || elInputPrice.dataset.isPreFilled === 'true') {
        elInputPrice.value = Math.round(livePricePrefill);
        elInputPrice.dataset.isPreFilled = 'true';
        updateSatoshiCalculation();
      }
      
      renderUi();
    }
  } catch (error) {
    console.error('Failed to load market rates:', error);
  }
}

/**
 * Auto-calculate satoshis as user types in form.
 */
function updateSatoshiCalculation() {
  const amount = parseFloat(elInputAmount.value) || 0;
  const price = parseFloat(elInputPrice.value) || 0;
  
  if (amount > 0 && price > 0) {
    const satoshis = calculateSatoshis(amount, price);
    elInputSat.value = satoshis.toLocaleString('en-US') + ' Sat';
  } else {
    elInputSat.value = '';
  }
}

/**
 * Render complete Dashboard calculations.
 */
function renderUi() {
  const livePriceTarget = state.displayCurrency === 'USD' ? state.livePriceUsd : state.livePriceThb;
  const stats = calculatePortfolioStats(state.records, livePriceTarget, state.displayCurrency, state.usdToThb);

  // 1. Goal Progress
  elAccumulatedBtcDisplay.innerText = displayVal(stats.totalBtc, 'btc');
  elTargetBtcDisplay.innerText = state.targetBtc.toFixed(8);
  
  const progressPercent = state.targetBtc > 0 ? (stats.totalBtc / state.targetBtc) * 100 : 0;
  elProgressBarFill.style.width = Math.min(progressPercent, 100) + '%';
  elProgressPercentBadge.innerText = progressPercent.toFixed(2) + '%';

  const remaining = state.targetBtc - stats.totalBtc;
  if (remaining > 0) {
    elRemainingBtcDisplay.innerText = `เหลืออีก: ${displayVal(remaining, 'btc')} BTC`;
  } else {
    elRemainingBtcDisplay.innerText = 'สะสมได้ครบเป้าหมายแล้ว! 🎉';
  }

  // 2. Stats Row Cards
  elCurrentValueDisplay.innerText = displayVal(stats.currentValue);
  elRefPriceDisplay.innerText = `อ้างอิง: ${formatCurrency(livePriceTarget)}`;
  
  elTotalCostDisplay.innerText = displayVal(stats.totalInvested);
  elAvgPriceDisplay.innerText = `เฉลี่ย: ${formatCurrency(stats.averagePrice)}`;
  
  const sign = stats.profitLoss >= 0 ? '+' : '';
  elProfitLossDisplay.innerText = `${sign}${displayVal(stats.profitLoss)}`;
  elProfitLossPercent.innerText = `${sign}${stats.profitLossPercent.toFixed(2)}%`;
  
  if (stats.profitLoss >= 0) {
    elProfitLossCard.className = 'glass-card stat-card success-theme';
    elProfitLossPercent.className = 'progress-badge positive';
  } else {
    elProfitLossCard.className = 'glass-card stat-card danger-theme';
    elProfitLossPercent.className = 'progress-badge negative';
  }

  // 3. Satoshi Card
  elTotalSatoshiDisplay.innerText = displayVal(stats.totalSatoshi, 'satoshi');

  // Render portfolio trend chart
  renderChart();

  // 4. Ledger Table List
  // Sort purchases chronologically (latest first)
  const sortedRecords = [...state.records].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (sortedRecords.length === 0) {
    elLedgerBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          ยังไม่มีรายการบันทึกข้อมูล กดเพิ่มรายการด้านบนได้เลย!
        </td>
      </tr>
    `;
    return;
  }

  elLedgerBody.innerHTML = sortedRecords.map(r => {
    const btcVal = parseInt(r.sat) / 100000000;
    
    // Convert record currency to active displayCurrency on the fly
    const origCurrency = r.currency || 'THB';
    let displayAmt = parseFloat(r.amount);
    let displayPrice = parseFloat(r.price);
    
    if (origCurrency !== state.displayCurrency) {
      if (state.displayCurrency === 'USD') {
        displayAmt = displayAmt / state.usdToThb;
        displayPrice = displayPrice / state.usdToThb;
      } else {
        displayAmt = displayAmt * state.usdToThb;
        displayPrice = displayPrice * state.usdToThb;
      }
    }

    // Calculate dynamic profit/loss for this specific entry row
    const currentEntryVal = btcVal * livePriceTarget;
    const rowPl = currentEntryVal - displayAmt;
    const rowPlPercent = displayAmt > 0 ? (rowPl / displayAmt) * 100 : 0;

    const plSign = rowPl >= 0 ? '+' : '';
    const plClass = rowPl >= 0 ? 'row-profit' : 'row-loss';
    const badgeClass = rowPl >= 0 ? 'row-pl-percent positive' : 'row-pl-percent negative';

    const absPl = Math.abs(rowPl);
    const formattedPlText = (rowPl >= 0 ? '+' : '-') + formatCurrency(absPl);
    const displayPlVal = state.privacyMode ? '••••' : formattedPlText;
    const plTdContent = `<span class="${plClass}">${displayPlVal}</span> <span class="${badgeClass}">${plSign}${rowPlPercent.toFixed(2)}%</span>`;

    return `
      <tr>
        <td style="font-family: var(--font-heading); font-weight: 600; color: var(--text-secondary);">${formatThaiDate(r.date)}</td>
        <td style="font-weight: 600;">${displayVal(displayAmt)}</td>
        <td>${formatCurrency(displayPrice)}</td>
        <td style="color: var(--primary); font-weight: 600;">${displayVal(btcVal, 'btc')}</td>
        <td style="font-weight: 600;">${displayVal(r.sat, 'satoshi')}</td>
        <td>${plTdContent}</td>
        <td style="text-align: center;">
          <button class="delete-entry-btn" data-id="${r.id}" title="ลบรายการ">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Bind individual row delete event listeners
  document.querySelectorAll('.delete-entry-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      deleteTransaction(id);
    });
  });
}

/**
 * Format ISO dates into localized readable Thai date string
 */
function formatThaiDate(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Save new transaction record to state.
 */
function addTransaction(e) {
  e.preventDefault();
  
  const amount = parseFloat(elInputAmount.value);
  const price = parseFloat(elInputPrice.value);
  
  if (amount <= 0 || price <= 0) return;

  const satValue = calculateSatoshis(amount, price);

  const newRecord = {
    id: Date.now().toString(),
    date: elInputDate.value,
    amount,
    price,
    sat: satValue,
    currency: state.displayCurrency // Record what currency was used to log this record!
  };

  state.records.push(newRecord);
  saveStateToStorage();
  
  // Reset input amount, auto pre-fill date to today and price to active live price
  elInputAmount.value = '';
  elInputSat.value = '';
  setDefaultDate();
  
  const livePricePrefill = state.displayCurrency === 'USD' ? state.livePriceUsd : state.livePriceThb;
  elInputPrice.value = Math.round(livePricePrefill);
  
  renderUi();
}

/**
 * Handle switching display currency (USD / THB)
 */
function switchDisplayCurrency(targetCurrency) {
  if (state.displayCurrency === targetCurrency) return;
  
  state.displayCurrency = targetCurrency;
  saveStateToStorage();
  
  // Update currency toggle button UI states
  const elCurrencyThbBtn = document.getElementById('currency-thb-btn');
  const elCurrencyUsdBtn = document.getElementById('currency-usd-btn');
  if (elCurrencyThbBtn && elCurrencyUsdBtn) {
    if (targetCurrency === 'USD') {
      elCurrencyUsdBtn.classList.add('active');
      elCurrencyThbBtn.classList.remove('active');
    } else {
      elCurrencyThbBtn.classList.add('active');
      elCurrencyUsdBtn.classList.remove('active');
    }
  }
  
  // Update input labels & pre-filled purchase price
  updateFormLabelsAndPrefills();
  
  renderUi();
}

/**
 * Update form labels, placeholders, and ledger headers to match the display currency.
 */
function updateFormLabelsAndPrefills() {
  const elLabelAmount = document.querySelector('label[for="input-amount"]');
  const elLabelPrice = document.querySelector('label[for="input-price"]');
  const elThAmount = document.querySelector('.ledger-table th:nth-child(2)');
  const elThPrice = document.querySelector('.ledger-table th:nth-child(3)');
  
  const livePricePrefill = state.displayCurrency === 'USD' ? state.livePriceUsd : state.livePriceThb;

  if (state.displayCurrency === 'USD') {
    if (elLabelAmount) elLabelAmount.innerText = 'จำนวนเงิน (USD)';
    if (elLabelPrice) elLabelPrice.innerText = 'ราคาที่ซื้อ (USD/BTC)';
    if (elThAmount) elThAmount.innerText = 'จำนวนเงิน (USD)';
    if (elThPrice) elThPrice.innerText = 'ราคาซื้อ (USD/BTC)';
    
    if (elInputPrice.dataset.isPreFilled === 'true' || !elInputPrice.value) {
      elInputPrice.value = Math.round(livePricePrefill);
      elInputPrice.dataset.isPreFilled = 'true';
    }
  } else {
    if (elLabelAmount) elLabelAmount.innerText = 'จำนวนเงิน (บาท)';
    if (elLabelPrice) elLabelPrice.innerText = 'ราคาที่ซื้อ (บาท/BTC)';
    if (elThAmount) elThAmount.innerText = 'จำนวนเงิน (บาท)';
    if (elThPrice) elThPrice.innerText = 'ราคาซื้อ (บาท/BTC)';
    
    if (elInputPrice.dataset.isPreFilled === 'true' || !elInputPrice.value) {
      elInputPrice.value = Math.round(livePricePrefill);
      elInputPrice.dataset.isPreFilled = 'true';
    }
  }
  
  updateSatoshiCalculation();
}

/**
 * Renders and updates the interactive ApexCharts area chart.
 */
function renderChart() {
  const chartEl = document.getElementById('portfolio-growth-chart');
  if (!chartEl) return;

  // Clear chart if no records exist
  if (state.records.length === 0) {
    chartEl.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 250px; color: var(--text-muted); font-size: 0.9rem; font-weight: 500;">
        เพิ่มบันทึกรายการซื้อรายการแรกเพื่อเริ่มต้นแสดงแนวโน้มพอร์ต!
      </div>
    `;
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  // Compile growth data points from engine
  const timelineData = generateChartData(state.records, state.displayCurrency, state.usdToThb);

  const dates = timelineData.map(d => formatThaiDate(d.date));
  const principalSeries = timelineData.map(d => d.principal);
  const valueSeries = timelineData.map(d => d.value);

  // Append a final real-time point representing Today's live portfolio net worth
  const todayStr = new Date().toISOString().split('T')[0];
  const lastPoint = timelineData[timelineData.length - 1];
  
  if (lastPoint && lastPoint.date !== todayStr) {
    const livePriceTarget = state.displayCurrency === 'USD' ? state.livePriceUsd : state.livePriceThb;
    const stats = calculatePortfolioStats(state.records, livePriceTarget, state.displayCurrency, state.usdToThb);
    dates.push('ปัจจุบัน');
    principalSeries.push(parseFloat(stats.totalInvested.toFixed(2)));
    valueSeries.push(parseFloat(stats.currentValue.toFixed(2)));
  }

  const currencySymbol = state.displayCurrency === 'USD' ? '$' : '฿';

  const options = {
    series: [
      {
        name: 'มูลค่าพอร์ตสุทธิ',
        data: valueSeries
      },
      {
        name: 'เงินต้นที่ออมสะสม',
        data: principalSeries
      }
    ],
    chart: {
      type: 'area',
      height: 250,
      toolbar: {
        show: false
      },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 500,
        dynamicAnimation: {
          enabled: true,
          speed: 350
        }
      },
      background: 'transparent',
      fontFamily: 'var(--font-body)'
    },
    colors: ['#F7931A', '#8e96a4'],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0.0,
        stops: [0, 95, 100],
        colorStops: [
          [
            {
              offset: 0,
              color: '#F7931A',
              opacity: 0.35
            },
            {
              offset: 100,
              color: '#F7931A',
              opacity: 0.0
            }
          ],
          [
            {
              offset: 0,
              color: '#8e96a4',
              opacity: 0.05
            },
            {
              offset: 100,
              color: '#8e96a4',
              opacity: 0.0
            }
          ]
        ]
      }
    },
    dataLabels: {
      enabled: false
    },
    stroke: {
      curve: 'smooth',
      width: [3, 2],
      dashArray: [0, 5]
    },
    grid: {
      borderColor: 'rgba(255, 255, 255, 0.04)',
      strokeDashArray: 4,
      xaxis: {
        lines: {
          show: false
        }
      },
      yaxis: {
        lines: {
          show: true
        }
      },
      padding: {
        top: 0,
        right: 10,
        bottom: 0,
        left: 10
      }
    },
    markers: {
      size: 4,
      colors: ['#F7931A', '#8e96a4'],
      strokeColors: [state.activeTheme === 'pitch-black' ? '#080808' : '#121622', state.activeTheme === 'pitch-black' ? '#080808' : '#121622'],
      strokeWidth: 2,
      hover: {
        size: 6
      }
    },
    xaxis: {
      categories: dates,
      labels: {
        style: {
          colors: 'var(--text-secondary)',
          fontSize: '10px',
          fontWeight: 600
        }
      },
      axisBorder: {
        show: false
      },
      axisTicks: {
        show: false
      }
    },
    yaxis: {
      labels: {
        style: {
          colors: 'var(--text-secondary)',
          fontSize: '10px',
          fontWeight: 600
        },
        formatter: function (val) {
          if (state.privacyMode) return '••••';
          if (val >= 1000000) return currencySymbol + (val / 1000000).toFixed(1) + 'M';
          if (val >= 1000) return currencySymbol + (val / 1000).toFixed(0) + 'K';
          return currencySymbol + Math.round(val).toLocaleString('en-US');
        }
      }
    },
    legend: {
      show: false
    },
    tooltip: {
      theme: 'dark',
      shared: true,
      intersect: false,
      y: {
        formatter: function (val) {
          if (state.privacyMode) return '••••••';
          return currencySymbol + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
      }
    }
  };

  if (chartInstance) {
    chartInstance.updateOptions(options);
  } else {
    chartEl.innerHTML = '';
    chartInstance = new ApexCharts(chartEl, options);
    chartInstance.render();
  }
}

/**
 * Delete transaction by ID.
 */
function deleteTransaction(id) {
  if (confirm('คุณต้องการลบรายการจดบันทึกซื้อนี้ใช่หรือไม่?')) {
    state.records = state.records.filter(r => r.id !== id);
    saveStateToStorage();
    renderUi();
  }
}

/**
 * Set current date picker default to local today.
 */
function setDefaultDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const today = new Date(now.getTime() - (offset*60*1000));
  elInputDate.value = today.toISOString().split('T')[0];
}

/**
 * Settings Modal trigger bindings.
 */
function initSettingsModal() {
  elSettingsTriggerBtn.addEventListener('click', () => {
    if (elSettingPortfolioName) elSettingPortfolioName.value = state.portfolioName;
    elSettingTargetBtc.value = state.targetBtc;
    elSettingsModal.classList.add('active');
  });

  elSettingsCloseBtn.addEventListener('click', () => {
    elSettingsModal.classList.remove('active');
  });

  elSettingsModal.addEventListener('click', (e) => {
    if (e.target === elSettingsModal) {
      elSettingsModal.classList.remove('active');
    }
  });

  // Portfolio Name changes
  if (elSettingPortfolioName) {
    elSettingPortfolioName.addEventListener('input', (e) => {
      const val = e.target.value.trim() || 'BTC DCA Portfolio';
      state.portfolioName = val;
      if (elAppPortfolioTitle) elAppPortfolioTitle.textContent = val;
      
      // Sync to share card title input
      const elSharePortfolioTitle = document.getElementById('share-portfolio-title');
      if (elSharePortfolioTitle) {
        elSharePortfolioTitle.value = val;
      }
      
      saveStateToStorage();
      
      // Update share card preview in real-time if modal is active
      updateShareCardCanvas();
    });
  }

  // Target Goal changes
  elSettingTargetBtc.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) || 1.0;
    state.targetBtc = Math.max(val, 0.00000001);
    saveStateToStorage();
    renderUi();
  });

  // Export Backups (JSON File Download)
  elExportBackupBtn.addEventListener('click', () => {
    const backupData = {
      version: '1.0',
      portfolioName: state.portfolioName,
      targetBtc: state.targetBtc,
      records: state.records
    };
    
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `btc-dca-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  // Import Backup click trigger
  elImportBackupTriggerBtn.addEventListener('click', () => {
    elImportFileInput.click();
  });

  // Import Backup File parsing
  elImportFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const importedData = JSON.parse(evt.target.result);
        if (!importedData.records || !Array.isArray(importedData.records)) {
          throw new Error('โครงสร้างไฟล์สำรองข้อมูลไม่ถูกต้อง');
        }

        if (confirm(`พบรายการบันทึกจำนวน ${importedData.records.length} รายการ คุณต้องการนำเข้ามาแทนที่ข้อมูลปัจจุบันหรือไม่?`)) {
          state.records = importedData.records;
          if (importedData.targetBtc) state.targetBtc = parseFloat(importedData.targetBtc) || 1.0;
          if (importedData.portfolioName) {
            state.portfolioName = importedData.portfolioName;
            if (elAppPortfolioTitle) elAppPortfolioTitle.textContent = state.portfolioName;
            if (elSettingPortfolioName) elSettingPortfolioName.value = state.portfolioName;
            const elSharePortfolioTitle = document.getElementById('share-portfolio-title');
            if (elSharePortfolioTitle) elSharePortfolioTitle.value = state.portfolioName;
          }
          
          saveStateToStorage();
          renderUi();
          elSettingsModal.classList.remove('active');
          alert('นำเข้าข้อมูลสำเร็จแล้ว!');
        }
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการนำเข้าไฟล์: ' + err.message);
      }
    };
    reader.readAsText(file);
    // Clear value to allow re-importing the same file
    elImportFileInput.value = '';
  });

  // Import CSV click trigger
  if (elImportCsvTriggerBtn) {
    elImportCsvTriggerBtn.addEventListener('click', () => {
      elImportCsvInput.click();
    });
  }

  // Import CSV File parsing
  if (elImportCsvInput) {
    elImportCsvInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (!file.name.toLowerCase().endsWith('.csv')) {
        alert('กรุณาเลือกไฟล์ .csv เท่านั้น');
        elImportCsvInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const csvData = evt.target.result;
          const lines = csvData.split('\n');
          
          // Helper to parse CSV row accounting for quoted values
          const parseCSVLine = (str) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < str.length; i++) {
              const char = str[i];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
              } else {
                current += char;
              }
            }
            result.push(current);
            return result;
          };

          const cleanNum = (val) => parseFloat(String(val).replace(/[^0-9.-]+/g, '')) || 0;

          const importedRecords = [];
          let addedCount = 0;
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const cols = parseCSVLine(line);
            
            // Check if it's a valid data row (col 0 contains '/')
            if (!cols[0] || !cols[0].includes('/')) continue;
            
            let dateStr = cols[0].replace(/["']/g, '').trim();

            // Try to parse DD/MM/YYYY
            const dateParts = dateStr.split('/');
            if (dateParts.length === 3) {
               const day = dateParts[0].padStart(2, '0');
               const month = dateParts[1].padStart(2, '0');
               const year = dateParts[2];
               dateStr = `${year}-${month}-${day}`;
            } else {
               const parsedDate = new Date(dateStr);
               if (!isNaN(parsedDate.getTime())) {
                 dateStr = parsedDate.toISOString().split('T')[0];
               } else {
                 continue; // Invalid date format
               }
            }
            
            const amountThb = cleanNum(cols[1]);
            const satoshisRaw = cleanNum(cols[2]);
            const btcAcquired = satoshisRaw / 100000000;
            const priceThb = cleanNum(cols[3]);
            
            if (amountThb <= 0) continue;
            
            importedRecords.push({
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
              date: dateStr,
              amount: amountThb,
              price: priceThb,
              sat: satoshisRaw,
              currency: 'THB'
            });
            addedCount++;
          }

          if (importedRecords.length === 0) {
             throw new Error('ไม่พบข้อมูลที่จะนำเข้าในไฟล์ CSV หรืออาจเป็นเพราะรูปแบบตัวเลขไม่ถูกต้อง');
          }

          if (confirm(`พบข้อมูลจำนวน ${addedCount} รายการ คุณต้องการนำเข้าและรวมกับข้อมูลปัจจุบันหรือไม่?`)) {
            // Add to state and save
            state.records = [...state.records, ...importedRecords];
            // Sort records by date descending
            state.records.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            saveStateToStorage();
            renderUi();
            
            if (typeof elSettingsModal !== 'undefined') {
              elSettingsModal.classList.remove('active');
            }
            
            alert(`นำเข้าประวัติจำนวน ${addedCount} รายการสำเร็จ!`);
          }

        } catch (err) {
          alert('เกิดข้อผิดพลาดในการนำเข้า CSV: ' + err.message);
        }
      };
      reader.readAsText(file);
      // Clear value to allow re-importing
      elImportCsvInput.value = '';
    });
  }

  // Clear all portfolio data
  elClearAllDataBtn.addEventListener('click', () => {
    if (confirm('⚠️ คำเตือน: คุณต้องการลบรายการบันทึก DCA ทั้งหมดออกอย่างถาวรใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้!')) {
      state.records = [];
      state.targetBtc = 1.0;
      saveStateToStorage();
      renderUi();
      elSettingsModal.classList.remove('active');
      alert('ลบข้อมูลทั้งหมดเรียบร้อยแล้ว');
    }
  });
}

/**
 * Helper to draw a rounded rectangle on Canvas
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draws the high DPI visual share card to the Canvas and updates preview image.
 */
function updateShareCardCanvas() {
  const canvas = document.getElementById('share-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const elRatioSquareBtn = document.getElementById('ratio-square-btn');
  const isSquare = elRatioSquareBtn ? elRatioSquareBtn.classList.contains('active') : true;
  
  const elShowYield = document.getElementById('share-show-yield');
  const elShowProgress = document.getElementById('share-show-progress');
  const elShowSats = document.getElementById('share-show-sats');

  const showYield = elShowYield ? elShowYield.checked : true;
  const showProgress = elShowProgress ? elShowProgress.checked : true;
  const showSats = elShowSats ? elShowSats.checked : true;

  const width = 1080;
  const height = isSquare ? 1080 : 1920;
  
  canvas.width = width;
  canvas.height = height;

  // 1. Gradient Background (Dynamic based on Theme)
  const grad = ctx.createLinearGradient(0, 0, width, height);
  if (state.activeTheme === 'pitch-black') {
    // Premium AMOLED Pitch Black Background
    grad.addColorStop(0, '#000000');
    grad.addColorStop(0.5, '#040404');
    grad.addColorStop(1, '#000000');
  } else {
    // Deep Space Dark (classic space blue-black)
    grad.addColorStop(0, '#0d111d');
    grad.addColorStop(0.5, '#090c15');
    grad.addColorStop(1, '#05060b');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 2. Glowing background lights
  // Orange glow top right
  let glow = ctx.createRadialGradient(width * 0.8, height * 0.2, 50, width * 0.8, height * 0.2, 500);
  glow.addColorStop(0, state.activeTheme === 'pitch-black' ? 'rgba(247, 147, 26, 0.11)' : 'rgba(247, 147, 26, 0.14)');
  glow.addColorStop(1, 'rgba(247, 147, 26, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(width * 0.8, height * 0.2, 500, 0, Math.PI * 2);
  ctx.fill();

  // Green glow bottom left
  glow = ctx.createRadialGradient(width * 0.2, height * 0.8, 50, width * 0.2, height * 0.8, 600);
  glow.addColorStop(0, state.activeTheme === 'pitch-black' ? 'rgba(0, 230, 118, 0.04)' : 'rgba(0, 230, 118, 0.05)');
  glow.addColorStop(1, 'rgba(0, 230, 118, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(width * 0.2, height * 0.8, 600, 0, Math.PI * 2);
  ctx.fill();

  // 3. Grid line overlay
  ctx.strokeStyle = state.activeTheme === 'pitch-black' ? 'rgba(255, 255, 255, 0.011)' : 'rgba(255, 255, 255, 0.015)';
  ctx.lineWidth = 1;
  const gridSize = 60;
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 4. Glowing Bitcoin Coin (Premium 3D Style)
  const coinX = width / 2;
  const coinY = isSquare ? height * 0.25 : height * 0.22;
  const coinR = 90;

  // Outer aura glow (large soft)
  let coinGlow = ctx.createRadialGradient(coinX, coinY, coinR * 0.5, coinX, coinY, coinR + 100);
  coinGlow.addColorStop(0, 'rgba(247, 147, 26, 0.30)');
  coinGlow.addColorStop(0.5, 'rgba(247, 147, 26, 0.08)');
  coinGlow.addColorStop(1, 'rgba(247, 147, 26, 0)');
  ctx.fillStyle = coinGlow;
  ctx.beginPath();
  ctx.arc(coinX, coinY, coinR + 100, 0, Math.PI * 2);
  ctx.fill();

  // Coin base shadow (3D depth)
  ctx.save();
  ctx.shadowColor = 'rgba(247, 147, 26, 0.45)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;

  // Coin body gradient (3D spherical lighting)
  const coinGrad = ctx.createRadialGradient(coinX - coinR * 0.3, coinY - coinR * 0.3, coinR * 0.1, coinX, coinY, coinR);
  coinGrad.addColorStop(0, '#ffcc66');
  coinGrad.addColorStop(0.35, '#f7931a');
  coinGrad.addColorStop(0.75, '#e07a0b');
  coinGrad.addColorStop(1, '#c76b08');
  ctx.fillStyle = coinGrad;
  ctx.beginPath();
  ctx.arc(coinX, coinY, coinR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Inner ring (embossed edge)
  ctx.strokeStyle = 'rgba(255, 220, 130, 0.3)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(coinX, coinY, coinR - 10, 0, Math.PI * 2);
  ctx.stroke();

  // Outer rim highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(coinX, coinY, coinR, 0, Math.PI * 2);
  ctx.stroke();

  // Top-left specular highlight (3D shine)
  ctx.save();
  ctx.beginPath();
  ctx.arc(coinX, coinY, coinR, 0, Math.PI * 2);
  ctx.clip();
  const specular = ctx.createRadialGradient(coinX - coinR * 0.35, coinY - coinR * 0.35, 0, coinX - coinR * 0.35, coinY - coinR * 0.35, coinR * 0.9);
  specular.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
  specular.addColorStop(0.4, 'rgba(255, 255, 255, 0.05)');
  specular.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = specular;
  ctx.fillRect(coinX - coinR, coinY - coinR, coinR * 2, coinR * 2);
  ctx.restore();

  // Bitcoin ₿ symbol using official SVG path (scaled & centered on coin)
  ctx.save();
  ctx.translate(coinX, coinY);
  const btcScale = coinR / 32 * 0.72;
  ctx.scale(btcScale, btcScale);
  ctx.translate(-32, -32);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  const btcPath = new Path2D('M46.11 27.441c.636-4.258-2.606-6.547-7.039-8.074l1.438-5.768-3.512-.875-1.4 5.616c-.922-.23-1.87-.447-2.812-.662l1.41-5.653-3.509-.875-1.439 5.766c-.764-.174-1.514-.346-2.242-.527l.004-.018-4.842-1.209-.934 3.75s2.605.597 2.55.634c1.422.355 1.68 1.296 1.636 2.042l-1.638 6.571c.098.025.225.061.365.117l-.37-.092-2.297 9.205c-.174.432-.615 1.08-1.609.834.035.051-2.552-.637-2.552-.637l-1.743 4.02 4.57 1.139c.85.213 1.683.436 2.502.646l-1.453 5.835 3.507.875 1.44-5.772c.957.26 1.887.5 2.797.726L27.504 50.8l3.511.875 1.453-5.823c5.987 1.133 10.49.676 12.383-4.738 1.527-4.36-.075-6.875-3.225-8.516 2.294-.531 4.022-2.04 4.483-5.157zM38.087 38.69c-1.086 4.36-8.426 2.004-10.807 1.412l1.928-7.729c2.38.594 10.011 1.77 8.88 6.317zm1.085-11.312c-.99 3.966-7.1 1.951-9.083 1.457l1.748-7.01c1.983.494 8.367 1.416 7.335 5.553z');
  ctx.fill(btcPath);
  ctx.restore();

  // Reset text state for subsequent text rendering
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // 5. Portfolio Title & Details
  const livePriceTarget = state.displayCurrency === 'USD' ? state.livePriceUsd : state.livePriceThb;
  const stats = calculatePortfolioStats(state.records, livePriceTarget, state.displayCurrency, state.usdToThb);

  const portTitleEl = document.getElementById('share-portfolio-title');
  const portTitleText = (portTitleEl ? portTitleEl.value.trim() : 'MY BITCOIN DCA') || 'MY BITCOIN DCA';

  ctx.fillStyle = '#8e96a4';
  ctx.font = '700 24px Outfit, Inter, sans-serif';
  ctx.fillText(portTitleText.toUpperCase(), width / 2, coinY + coinR + 55);

  // Total BTC Accumulated
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 68px Outfit, Inter, sans-serif';
  const btcText = displayVal(stats.totalBtc, 'btc') + ' BTC';
  ctx.fillText(btcText, width / 2, coinY + coinR + 130);

  // Satoshis (Optional)
  if (showSats) {
    ctx.fillStyle = '#f7931a';
    ctx.font = '700 32px Outfit, Inter, sans-serif';
    const satoshisText = displayVal(stats.totalSatoshi, 'satoshi') + ' SATS';
    ctx.fillText(satoshisText, width / 2, coinY + coinR + 185);
  }

  // Layout alignment depending on format
  const startY = isSquare ? height * 0.56 : height * 0.48;

  // 6. Net Yield Pill Capsule (Optional)
  if (showYield) {
    const plSign = stats.profitLoss >= 0 ? '+' : '';
    const plPercentText = `${plSign}${stats.profitLossPercent.toFixed(2)}%`;
    const plColor = stats.profitLoss >= 0 ? '#00e676' : '#ff1744';

    const pillW = 320;
    const pillH = 75;
    const pillX = (width - pillW) / 2;
    const pillY = startY;

    // Pill label
    ctx.fillStyle = '#8e96a4';
    ctx.font = '600 18px Outfit, Inter, sans-serif';
    ctx.fillText('ผลตอบแทนสุทธิ (NET YIELD)', width / 2, pillY - 18);

    // Pill body
    if (state.activeTheme === 'pitch-black') {
      ctx.fillStyle = stats.profitLoss >= 0 ? 'rgba(0, 230, 118, 0.05)' : 'rgba(255, 23, 68, 0.05)';
      ctx.strokeStyle = stats.profitLoss >= 0 ? 'rgba(0, 230, 118, 0.16)' : 'rgba(255, 23, 68, 0.16)';
    } else {
      ctx.fillStyle = stats.profitLoss >= 0 ? 'rgba(0, 230, 118, 0.08)' : 'rgba(255, 23, 68, 0.08)';
      ctx.strokeStyle = stats.profitLoss >= 0 ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 23, 68, 0.2)';
    }
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 37.5);
    ctx.fill();
    ctx.stroke();

    // Yield Value text
    ctx.fillStyle = plColor;
    ctx.font = '800 36px Outfit, Inter, sans-serif';
    ctx.fillText(plPercentText, width / 2, pillY + 46);

    // Total investment & current value details if privacy is off
    if (!state.privacyMode) {
      ctx.fillStyle = '#8e96a4';
      ctx.font = '600 18px Outfit, Inter, sans-serif';
      ctx.fillText(`มูลค่าพอร์ต: ${formatCurrency(stats.currentValue)}  (ทุน: ${formatCurrency(stats.totalInvested)})`, width / 2, pillY + 115);
    }
  }

  // 7. Goal Progress Bar (Optional)
  if (showProgress) {
    const barY = isSquare ? height * 0.76 : height * 0.69;
    const barW = 680;
    const barH = 18;
    const barX = (width - barW) / 2;

    // Progress Bar Title
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8e96a4';
    ctx.font = '600 18px Outfit, Inter, sans-serif';
    ctx.fillText('สะสมสู่เป้าหมาย (BTC GOAL)', barX, barY - 15);

    // Progress Percentage
    const progressPercent = state.targetBtc > 0 ? (stats.totalBtc / state.targetBtc) * 100 : 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f7931a';
    ctx.font = '700 20px Outfit, Inter, sans-serif';
    ctx.fillText(progressPercent.toFixed(2) + '%', barX + barW, barY - 15);

    // Draw background track
    ctx.fillStyle = state.activeTheme === 'pitch-black' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.05)';
    drawRoundedRect(ctx, barX, barY, barW, barH, 9);
    ctx.fill();

    // Draw Progress Fill
    const fillW = Math.min((progressPercent / 100) * barW, barW);
    if (fillW > 0) {
      const fillGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
      fillGrad.addColorStop(0, '#f7931a');
      fillGrad.addColorStop(1, '#ff9e24');
      ctx.fillStyle = fillGrad;
      drawRoundedRect(ctx, barX, barY, fillW, barH, 9);
      ctx.fill();
    }
  }

  // 8. Footer Watermark
  ctx.textAlign = 'center'; // Explicitly restore center alignment
  const waterY = isSquare ? height - 70 : height - 120;

  // Subtle separator line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width * 0.2, waterY - 40);
  ctx.lineTo(width * 0.8, waterY - 40);
  ctx.stroke();

  ctx.fillStyle = '#535d6e';
  ctx.font = '700 18px Outfit, Inter, sans-serif';
  ctx.fillText('฿ BTC DCA PORTFOLIO TRACKER', width / 2, waterY);

  ctx.font = '500 14px Outfit, Inter, sans-serif';
  ctx.fillStyle = '#3a4250';
  ctx.fillText('CREATE YOUR SECURE CLIENT-SIDE DCA DIARY', width / 2, waterY + 25);

  // 9. Output to responsive preview image
  const previewImg = document.getElementById('share-preview-image');
  if (previewImg) {
    previewImg.src = canvas.toDataURL('image/png');
  }
}

/**
 * Initializes all social share triggers, modal controls, format toggles, download, and copy clipboards.
 */
function initShareModal() {
  const elShareTriggerBtn = document.getElementById('share-trigger-btn');
  const elShareModal = document.getElementById('share-modal');
  const elShareCloseBtn = document.getElementById('share-close-btn');
  const elRatioSquareBtn = document.getElementById('ratio-square-btn');
  const elRatioStoryBtn = document.getElementById('ratio-story-btn');
  const elSharePortfolioTitle = document.getElementById('share-portfolio-title');
  const elDownloadBtn = document.getElementById('download-share-card-btn');
  const elCopyBtn = document.getElementById('copy-share-card-btn');
  const elNativeShareBtn = document.getElementById('native-share-btn');
  const elWebShareWrapper = document.getElementById('web-share-wrapper');

  if (!elShareTriggerBtn || !elShareModal) return;

  // Open Share Modal
  elShareTriggerBtn.addEventListener('click', () => {
    elShareModal.classList.add('active');
    updateShareCardCanvas();
  });

  // Close Share Modal
  elShareCloseBtn.addEventListener('click', () => {
    elShareModal.classList.remove('active');
  });

  elShareModal.addEventListener('click', (e) => {
    if (e.target === elShareModal) {
      elShareModal.classList.remove('active');
    }
  });

  // Switch Ratios
  if (elRatioSquareBtn && elRatioStoryBtn) {
    elRatioSquareBtn.addEventListener('click', () => {
      elRatioSquareBtn.classList.add('active');
      elRatioStoryBtn.classList.remove('active');
      updateShareCardCanvas();
    });

    elRatioStoryBtn.addEventListener('click', () => {
      elRatioStoryBtn.classList.add('active');
      elRatioSquareBtn.classList.remove('active');
      updateShareCardCanvas();
    });
  }

  // Re-draw canvas dynamically as title inputs or toggle switches change
  if (elSharePortfolioTitle) {
    elSharePortfolioTitle.addEventListener('input', updateShareCardCanvas);
  }

  const elShowYield = document.getElementById('share-show-yield');
  const elShowProgress = document.getElementById('share-show-progress');
  const elShowSats = document.getElementById('share-show-sats');

  if (elShowYield) elShowYield.addEventListener('change', updateShareCardCanvas);
  if (elShowProgress) elShowProgress.addEventListener('change', updateShareCardCanvas);
  if (elShowSats) elShowSats.addEventListener('change', updateShareCardCanvas);

  // Action: Download Card PNG
  if (elDownloadBtn) {
    elDownloadBtn.addEventListener('click', () => {
      const canvas = document.getElementById('share-canvas');
      if (!canvas) return;

      const isSquare = elRatioSquareBtn ? elRatioSquareBtn.classList.contains('active') : true;
      const ratioName = isSquare ? 'square' : 'story';

      const link = document.createElement('a');
      link.download = `btc-dca-share-${ratioName}-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  }

  // Action: Copy to Clipboard (Image blob)
  if (elCopyBtn) {
    elCopyBtn.addEventListener('click', () => {
      const canvas = document.getElementById('share-canvas');
      if (!canvas) return;

      canvas.toBlob(blob => {
        if (blob) {
          try {
            navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            alert('คัดลอกรูปภาพไปยังคลิปบอร์ดสำเร็จแล้ว! สามารถกด Ctrl+V หรือคลิกขวาเพื่อวางโพสต์ได้ทันที');
          } catch (err) {
            console.warn('Modern Clipboard API copy failed, trying alternative:', err);
            alert('ไม่สามารถคัดลอกรูปภาพโดยตรงผ่านเว็บบราวเซอร์เวอร์ชันนี้ได้ กรุณาใช้ปุ่มดาวน์โหลดรูปภาพแทนนะครับ');
          }
        }
      }, 'image/png');
    });
  }

  // Web Share API fallback for Mobile devices
  if (navigator.canShare && navigator.share && elWebShareWrapper && elNativeShareBtn) {
    elWebShareWrapper.style.display = 'flex';

    elNativeShareBtn.addEventListener('click', () => {
      const canvas = document.getElementById('share-canvas');
      if (!canvas) return;

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'btc-dca-share.png', { type: 'image/png' });
        try {
          await navigator.share({
            files: [file],
            title: 'พอร์ต DCA Bitcoin ของฉัน',
            text: 'สะสมบิตคอยน์สำเร็จแบบมีเป้าหมายด้วยระบบบันทึก DCA ส่วนตัว!'
          });
        } catch (err) {
          console.warn('Native share interaction canceled:', err);
        }
      }, 'image/png');
    });
  }
}

/**
 * Initializes direct inline renaming of the portfolio title inside the header.
 */
function initInlineTitleEditor() {
  const elAppPortfolioTitle = document.getElementById('app-portfolio-title');
  const wrapper = document.querySelector('.portfolio-title-wrapper');
  if (!elAppPortfolioTitle || !wrapper) return;

  elAppPortfolioTitle.addEventListener('click', () => {
    // If we're already editing, do nothing
    if (wrapper.querySelector('.inline-title-input')) return;

    const currentName = state.portfolioName;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-title-input';
    input.value = currentName;
    input.maxLength = 25;

    // Hide h1 and edit icon temporarily
    const editIcon = wrapper.querySelector('.edit-icon');
    if (editIcon) editIcon.style.opacity = '0';
    elAppPortfolioTitle.style.display = 'none';
    
    wrapper.appendChild(input);
    input.focus();
    input.select();

    let isSaved = false;

    const saveChanges = () => {
      if (isSaved) return;
      isSaved = true;
      
      const val = input.value.trim() || 'BTC DCA Portfolio';
      state.portfolioName = val;
      elAppPortfolioTitle.textContent = val;

      // Sync inputs across other panels
      if (elSettingPortfolioName) elSettingPortfolioName.value = val;
      const elSharePortfolioTitle = document.getElementById('share-portfolio-title');
      if (elSharePortfolioTitle) elSharePortfolioTitle.value = val;

      saveStateToStorage();

      // Clean up input element and restore title display
      input.remove();
      elAppPortfolioTitle.style.display = 'block';
      if (editIcon) editIcon.style.opacity = '';

      // Re-draw Canvas
      updateShareCardCanvas();
    };

    const cancelChanges = () => {
      if (isSaved) return;
      isSaved = true;
      input.remove();
      elAppPortfolioTitle.style.display = 'block';
      if (editIcon) editIcon.style.opacity = '';
    };

    // Save on Enter, Cancel on Escape
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveChanges();
      } else if (e.key === 'Escape') {
        cancelChanges();
      }
    });

    // Save on blur (clicking away)
    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.body.contains(input)) {
          saveChanges();
        }
      }, 100);
    });
  });
}

/**
 * Primary Controller Initializer
 */
async function initApp() {
  loadStateFromStorage();
  setDefaultDate();
  
  // Sync Sat calculations as user types in logger
  elInputAmount.addEventListener('input', () => {
    elInputPrice.dataset.isPreFilled = 'false'; // User is writing, remove auto-fill locked state
    updateSatoshiCalculation();
  });
  elInputPrice.addEventListener('input', () => {
    elInputPrice.dataset.isPreFilled = 'false'; // User is writing, remove auto-fill locked state
    updateSatoshiCalculation();
  });

  // Form submission
  elDcaForm.addEventListener('submit', addTransaction);

  // Bind actions
  elToggleVisibilityBtn.addEventListener('click', togglePrivacyMode);
  
  const elToggleThemeBtn = document.getElementById('toggle-theme-btn');
  if (elToggleThemeBtn) {
    elToggleThemeBtn.addEventListener('click', toggleThemeMode);
  }
  
  const elCurrencyThbBtn = document.getElementById('currency-thb-btn');
  const elCurrencyUsdBtn = document.getElementById('currency-usd-btn');
  if (elCurrencyThbBtn && elCurrencyUsdBtn) {
    elCurrencyThbBtn.addEventListener('click', () => switchDisplayCurrency('THB'));
    elCurrencyUsdBtn.addEventListener('click', () => switchDisplayCurrency('USD'));
  }
  
  initSettingsModal();
  initShareModal();
  initInlineTitleEditor();

  // Render initial localStorage values
  renderUi();
  updateFormLabelsAndPrefills();

  // Load real-time market rates and schedule auto-refresh every 30s
  await loadMarketPrices();
  setInterval(loadMarketPrices, 30000);
}

// Bind to window DOM loading
window.addEventListener('DOMContentLoaded', initApp);
