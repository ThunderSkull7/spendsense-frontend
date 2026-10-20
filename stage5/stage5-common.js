/*
 * Shared Stage 5 helpers.
 *
 * These are the pure functions the Stage 5 pages share: the reporting period
 * maths, the report query builder, the dashboard widget layout rules and the
 * transaction search query builder. Keeping them here means they can be
 * tested under Node without a browser, and the pages stay thin renderers.
 */
(function (root) {
  'use strict';

  const pad = (value) => String(value).padStart(2, '0');

  /** YYYY-MM-DD for a Date, in UTC. */
  const iso = (date) =>
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

  /** The first day of the month that contains the given YYYY-MM value. */
  const monthStart = (month) => {
    const [year, monthNumber] = String(month).split('-').map(Number);
    return iso(new Date(Date.UTC(year, monthNumber - 1, 1)));
  };

  /** The last day of the month that contains the given YYYY-MM value. */
  const monthEnd = (month) => {
    const [year, monthNumber] = String(month).split('-').map(Number);
    return iso(new Date(Date.UTC(year, monthNumber, 0)));
  };

  /**
   * Convert an inclusive month range into the inclusive UTC date range the
   * reports API expects.
   */
  const monthRangeToDates = (fromMonth, toMonth) => ({
    from: `${fromMonth}-01`,
    to: monthEnd(toMonth),
  });

  /** Shift a YYYY-MM value by a number of months. */
  const addMonths = (month, delta) => {
    const [year, monthNumber] = String(month).split('-').map(Number);
    return iso(new Date(Date.UTC(year, monthNumber - 1 + delta, 1))).slice(0, 7);
  };

  /**
   * The date range for a named reporting preset.
   * `today` defaults to the current UTC date.
   */
  const presetRange = (preset, today = new Date()) => {
    const now = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    );
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    switch (preset) {
      case 'last-month': {
        const date = new Date(Date.UTC(year, month - 1, 1));
        return {
          from: monthStart(iso(date).slice(0, 7)),
          to: monthEnd(iso(date).slice(0, 7)),
        };
      }
      case 'this-quarter': {
        const start = Math.floor(month / 3) * 3;
        return { from: monthStart(iso(new Date(Date.UTC(year, start, 1))).slice(0, 7)), to: monthEnd(iso(new Date(Date.UTC(year, start + 2, 1))).slice(0, 7)) };
      }
      case 'last-quarter': {
        const start = Math.floor(month / 3) * 3 - 3;
        const base = new Date(Date.UTC(year, start, 1));
        return {
          from: monthStart(iso(base).slice(0, 7)),
          to: monthEnd(iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 2, 1))).slice(0, 7)),
        };
      }
      case 'last-6-months':
        return { from: monthStart(addMonths(iso(now).slice(0, 7), -5)), to: iso(now) };
      case 'year-to-date':
        return { from: `${year}-01-01`, to: iso(now) };
      case 'custom':
        return null;
      case 'this-month':
      default:
        return { from: monthStart(iso(now).slice(0, 7)), to: iso(now) };
    }
  };

  /** The report query for a period, a comparison mode and a section list. */
  const buildReportQuery = ({ from, to, compare, sections }) => {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (compare) query.set('compare', compare);
    if (Array.isArray(sections) && sections.length) query.set('sections', sections.join(','));
    return query;
  };

  /** The transaction search query for a filter state. */
  const buildSearchQuery = (state, { includePage = true } = {}) => {
    const query = new URLSearchParams();
    if (state.q) query.set('q', state.q);
    if (state.type) query.set('type', state.type);
    if (state.from) query.set('from', state.from);
    if (state.to) query.set('to', state.to);
    if (state.min_amount) query.set('min_amount', state.min_amount);
    if (state.max_amount) query.set('max_amount', state.max_amount);
    if (state.category_id) query.set('category_id', state.category_id);
    if (state.sort) query.set('sort', state.sort);
    query.set('per_page', String(state.per_page || 25));
    if (includePage) query.set('page', String(state.page || 1));
    return query;
  };

  /**
   * The default dashboard layout: every widget in order, with the ones that
   * depend on optional manual records hidden.
   */
  const defaultWidgetLayout = (keys, hidden = []) =>
    keys.map((key) => ({ key, visible: !hidden.includes(key) }));

  /**
   * Normalise a saved layout. Unknown keys are dropped, the server order is
   * kept, and a widget the server did not send keeps its default visibility.
   */
  const normalizeWidgetLayout = (widgets, keys, hidden = []) => {
    const known = Array.isArray(widgets) ? widgets : [];
    const seen = new Set();
    const ordered = [];

    known.forEach((widget) => {
      if (!widget || !keys.includes(widget.key) || seen.has(widget.key)) return;
      seen.add(widget.key);
      ordered.push({ key: widget.key, visible: widget.visible === true });
    });

    keys.forEach((key) => {
      if (!seen.has(key)) {
        ordered.push({ key, visible: !hidden.includes(key) });
      }
    });

    return ordered;
  };

  /** Move a widget one position up or down in the layout. */
  const moveWidget = (layout, key, offset) => {
    const position = layout.findIndex((widget) => widget.key === key);
    if (position === -1) return layout.slice();
    const target = position + offset;
    if (target < 0 || target >= layout.length) return layout.slice();
    const next = layout.slice();
    const [moved] = next.splice(position, 1);
    next.splice(target, 0, moved);
    return next;
  };

  /** The visible widget keys, in layout order. */
  const visibleWidgetKeys = (layout) =>
    layout.filter((widget) => widget.visible).map((widget) => widget.key);

  const helpers = {
    iso,
    monthStart,
    monthEnd,
    monthRangeToDates,
    addMonths,
    presetRange,
    buildReportQuery,
    buildSearchQuery,
    defaultWidgetLayout,
    normalizeWidgetLayout,
    moveWidget,
    visibleWidgetKeys,
  };

  if (typeof window !== 'undefined') window.SpendSenseStage5 = helpers;
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
})(typeof window !== 'undefined' ? window : globalThis);
