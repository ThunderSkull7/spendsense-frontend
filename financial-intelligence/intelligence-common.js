/*
 * Shared Stage 4 helpers for spending insights, cash-flow forecast, net worth
 * and subscription tracking. Pure functions live here so they can be tested
 * under Node without a browser; page-specific rendering stays in each module.
 */
(function (root) {
  'use strict';

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const MONTHS_SHORT = MONTHS.map((name) => name.slice(0, 3));

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const toNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const progressPercent = (value) => {
    const number = toNumber(value, 0);
    return clamp(number, 0, 100);
  };

  const percentage = (part, whole, decimals = 1) => {
    const numerator = toNumber(part, 0);
    const denominator = toNumber(whole, 0);
    if (denominator <= 0) return null;
    return Math.round((numerator / denominator) * 100 * 10 ** decimals) / 10 ** decimals;
  };

  const formatPercent = (value, fallback = '—') => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return fallback;
    const number = Number(value);
    return `${number.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
  };

  const changeTone = (value, { inverse = false } = {}) => {
    const number = toNumber(value, 0);
    if (number === 0) return 'neutral';
    const positive = inverse ? number < 0 : number > 0;
    return positive ? 'pos' : 'neg';
  };

  const monthLabel = (value, { short = false } = {}) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})/);
    if (!match) return String(value || '—');
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return String(value || '—');
    return `${(short ? MONTHS_SHORT : MONTHS)[month - 1]} ${year}`;
  };

  const monthName = (value) => monthLabel(value);

  const dateLabel = (value) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return String(value || '—');
    return `${match[3]} ${MONTHS_SHORT[Number(match[2]) - 1]} ${match[1]}`;
  };

  const todayIso = () => new Date().toISOString().slice(0, 10);

  const monthInputValue = (date = new Date()) => String(date.toISOString().slice(0, 7));

  const addMonths = (value, delta) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})/);
    if (!match) return monthInputValue();
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + Number(delta), 1));
    return date.toISOString().slice(0, 7);
  };

  const dateRangeIsValid = (from, to) =>
    /^\d{4}-\d{2}$/.test(String(from)) &&
    /^\d{4}-\d{2}$/.test(String(to)) &&
    String(from) <= String(to);

  const rangeMonthCount = (from, to) => {
    if (!dateRangeIsValid(from, to)) return 0;
    const [fromYear, fromMonth] = from.split('-').map(Number);
    const [toYear, toMonth] = to.split('-').map(Number);
    return (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
  };

  const statusLabel = (value) => ({
    active: 'Active',
    paused: 'Paused',
    cancelled: 'Cancelled',
    archived: 'Archived',
    stopped: 'Stopped',
  }[value] || String(value || 'Unknown'));

  const statusTone = (value) => ({
    active: 'green',
    paused: 'amber',
    cancelled: 'neutral',
    archived: 'neutral',
    stopped: 'danger',
  }[value] || 'neutral');

  const frequencyLabel = (value) => ({
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Every two weeks',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    'half-yearly': 'Every six months',
    yearly: 'Yearly',
  }[value] || String(value || '—'));

  const entryTypeLabel = (value) => (value === 'liability' ? 'Liability' : 'Asset');

  const netWorthTone = (value) => (toNumber(value, 0) < 0 ? 'neg' : 'pos');

  const forecastBalanceLabel = (status) => ({
    unavailable: 'Not available',
    not_calculable: 'Not calculable',
  }[status] || 'Not available');

  const cleanMoney = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : '';
  };

  const errorMessage = (result, fallback = 'Something went wrong. Please try again.') => {
    const data = result && result.data;
    if (data && data.errors && typeof data.errors === 'object') {
      const first = Object.values(data.errors).flat().find((item) => typeof item === 'string' && item.trim());
      if (first) return first.slice(0, 240);
    }
    if (data && typeof data.message === 'string' && data.message.trim()) {
      return data.message.slice(0, 240);
    }
    return fallback;
  };

  const apiNote = (message) => String(message || '').slice(0, 300);

  const helpers = {
    clamp,
    toNumber,
    progressPercent,
    percentage,
    formatPercent,
    changeTone,
    monthLabel,
    monthName,
    dateLabel,
    todayIso,
    monthInputValue,
    addMonths,
    dateRangeIsValid,
    rangeMonthCount,
    statusLabel,
    statusTone,
    frequencyLabel,
    entryTypeLabel,
    netWorthTone,
    forecastBalanceLabel,
    cleanMoney,
    errorMessage,
    apiNote,
  };

  if (typeof window !== 'undefined') window.SpendSenseIntelligence = helpers;
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
})(typeof window !== 'undefined' ? window : globalThis);
