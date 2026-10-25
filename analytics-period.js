// Shared analytics period context for the dashboard and reports pages.
// Period boundaries use a date-only month/year, which matches the existing
// analytics controller (`Carbon::createFromDate($year, $month, 1)`), so no
// backend change is required to keep all charts and cards on one period.
const SpendSensePeriod = (() => {
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const STORAGE_KEY = 'spendsense.analytics-period.v1';
  const browser = typeof window !== 'undefined' ? window : null;

  const normalizePeriod = ({ month, year } = {}) => {
    const numericMonth = Number(month);
    const numericYear = Number(year);
    const useMonth = Number.isFinite(numericMonth) && numericMonth >= 1 && numericMonth <= 12;
    const useYear = Number.isFinite(numericYear) && numericYear >= 1900 && numericYear <= 2999;
    if (!useMonth || !useYear) return null;
    return { month: numericMonth, year: numericYear };
  };

  const currentPeriod = () => {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  };

  // Reports can pass an explicit period through the URL, and the user's last
  // selection is preserved per browser session. This keeps the dashboard and
  // reports views on the same period without duplicating period-selection UI.
  const readStoredPeriod = () => {
    if (!browser || typeof browser.sessionStorage === 'undefined') return null;
    try {
      const raw = browser.sessionStorage.getItem(STORAGE_KEY);
      const stored = raw ? JSON.parse(raw) : null;
      return stored ? normalizePeriod(stored) : null;
    } catch (err) {
      return null;
    }
  };

  const readPeriod = ({ fromQuery = true } = {}) => {
    if (fromQuery && typeof location !== 'undefined' && location.search) {
      const query = new URLSearchParams(location.search);
      const queryPeriod = normalizePeriod({
        month: query.get('month'),
        year: query.get('year'),
      });
      if (queryPeriod) return queryPeriod;
    }
    return readStoredPeriod() || currentPeriod();
  };

  const savePeriod = (period) => {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(period));
    } catch (err) {
      // Storage being unavailable must not break analytics.
    }
  };

  // Existing analytics endpoints accept `?month=&year=` and return exact
  // month/year data, so passing this to all metrics keeps boundaries aligned.
  const query = (endpoint, period) => {
    const target = typeof period === 'string' ? normalizePeriod(period) : period;
    const activePeriod = normalizePeriod(target) || currentPeriod();
    return `${endpoint}?month=${activePeriod.month}&year=${activePeriod.year}`;
  };

  const label = (period, options = {}) => {
    const activePeriod = normalizePeriod(period) || currentPeriod();
    const monthName = MONTH_NAMES[activePeriod.month - 1] || '';
    if (options.short) return `${monthName.slice(0, 3)} ${activePeriod.year}`;
    return `${monthName} ${activePeriod.year}`;
  };

  return {
    currentPeriod,
    label,
    normalizePeriod,
    query,
    readPeriod,
    savePeriod,
  };
})();

if (typeof window !== 'undefined') {
  window.SpendSensePeriod = SpendSensePeriod;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpendSensePeriod;
}
