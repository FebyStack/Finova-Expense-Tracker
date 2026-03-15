// js/currency.js
// Exchange rate API + conversion helpers
// Uses ExchangeRate-API free tier (no key needed for open endpoint)

const API_BASE = 'https://open.er-api.com/v6/latest';

// ── Cache ──────────────────────────────────────────────────
let rateCache = {};          // { USD: { PHP: 56.2, EUR: 0.92, ... }, ... }
let lastFetch = {};          // { USD: timestamp, ... }
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── Supported currencies ───────────────────────────────────
export const CURRENCIES = [
  { code: 'PHP', name: 'Philippine Peso',    symbol: '₱'  },
  { code: 'USD', name: 'US Dollar',          symbol: '$'  },
  { code: 'EUR', name: 'Euro',               symbol: '€'  },
  { code: 'GBP', name: 'British Pound',      symbol: '£'  },
  { code: 'JPY', name: 'Japanese Yen',       symbol: '¥'  },
  { code: 'SGD', name: 'Singapore Dollar',   symbol: 'S$' },
  { code: 'AUD', name: 'Australian Dollar',  symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar',    symbol: 'C$' },
  { code: 'KRW', name: 'Korean Won',         symbol: '₩'  },
  { code: 'INR', name: 'Indian Rupee',       symbol: '₹'  },
];

export function getCurrencySymbol(code) {
  return CURRENCIES.find(c => c.code === code)?.symbol || code;
}

// ── Fetch rates for a base currency ────────────────────────
export async function fetchRates(baseCurrency = 'PHP') {
  const now = Date.now();

  // Return cached if fresh
  if (rateCache[baseCurrency] && lastFetch[baseCurrency] && (now - lastFetch[baseCurrency] < CACHE_TTL)) {
    return rateCache[baseCurrency];
  }

  try {
    const res = await fetch(`${API_BASE}/${baseCurrency}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.result === 'success' && data.rates) {
      rateCache[baseCurrency] = data.rates;
      lastFetch[baseCurrency] = now;
      console.log(`✅ Exchange rates fetched for ${baseCurrency}`);
      return data.rates;
    }
    throw new Error('Invalid API response');
  } catch (err) {
    console.warn('⚠️ Exchange rate fetch failed:', err.message);
    // Return whatever we have cached, or 1:1 fallback
    return rateCache[baseCurrency] || null;
  }
}

// ── Convert amount from one currency to another ────────────
// Returns the converted amount, or the original if conversion unavailable
export async function convertAmount(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  if (!amount || isNaN(amount)) return 0;

  const rates = await fetchRates(fromCurrency);
  if (!rates || !rates[toCurrency]) return amount; // fallback: no conversion

  return amount * rates[toCurrency];
}

// ── Synchronous convert (requires rates to already be cached) ──
export function convertSync(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  if (!amount || isNaN(amount)) return 0;

  const rates = rateCache[fromCurrency];
  if (!rates || !rates[toCurrency]) return amount;

  return amount * rates[toCurrency];
}

// ── Convert an array of items with .amount and .currency ───
// Returns { total, items[] } with converted amounts
export async function convertItems(items, baseCurrency) {
  // Pre-fetch all needed currency rates
  const uniqueCurrencies = [...new Set(items.map(i => i.currency).filter(c => c && c !== baseCurrency))];
  await Promise.all(uniqueCurrencies.map(c => fetchRates(c)));

  let total = 0;
  const converted = items.map(item => {
    const orig = parseFloat(item.amount) || 0;
    const cur  = item.currency || baseCurrency;
    const amt  = convertSync(orig, cur, baseCurrency);
    total += amt;
    return { ...item, convertedAmount: amt, originalCurrency: cur };
  });

  return { total, items: converted };
}

// ── Format currency with Intl ──────────────────────────────
export function formatCurrency(amount, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount);
}

// ── Pre-warm cache for a base currency ─────────────────────
export async function warmRateCache(baseCurrency) {
  await fetchRates(baseCurrency);
}
