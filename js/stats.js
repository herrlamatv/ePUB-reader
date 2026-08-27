/* App.Stats – reading time tracked by heartbeat, plus the stats dialog */
window.App = window.App || {};

App.Stats = (function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TICK_SECONDS = 30;
  const IDLE_LIMIT_MS = 60000;

  let interval = null;
  let lastActivity = 0;
  let bookId = null;

  function startSession(id) {
    bookId = id;
    lastActivity = Date.now();
    if (interval) clearInterval(interval);
    interval = setInterval(tick, TICK_SECONDS * 1000);
  }

  function endSession() {
    if (interval) { clearInterval(interval); interval = null; }
    bookId = null;
  }

  function recordActivity() { lastActivity = Date.now(); }

  function tick() {
    if (!bookId || document.hidden) return;
    if (Date.now() - lastActivity > IDLE_LIMIT_MS) return;
    const data = App.Store.getData();
    if (!data) return;
    const day = App.Utils.todayKey();
    const d = data.stats.days[day] = data.stats.days[day] || { seconds: 0, perBook: {} };
    d.seconds += TICK_SECONDS;
    d.perBook[bookId] = (d.perBook[bookId] || 0) + TICK_SECONDS;
    updateStreak(day);
    App.Store.save();
  }

  function updateStreak(day) {
    const s = App.Store.getData().stats.streak;
    if (s.lastDay === day) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    s.current = s.lastDay === yKey ? s.current + 1 : 1;
    s.best = Math.max(s.best, s.current);
    s.lastDay = day;
  }

  function totalForBook(id) {
    const data = App.Store.getData();
    if (!data) return 0;
    let sum = 0;
    Object.values(data.stats.days).forEach((d) => {
      sum += (d.perBook && d.perBook[id]) || 0;
    });
    return sum;
  }

  /* ── Dialog ── */

  function lastNDays(n) {
    const out = [];
    const d = new Date();
    d.setDate(d.getDate() - (n - 1));
    for (let i = 0; i < n; i++) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  function showDialog() {
    const data = App.Store.getData();
    if (!data) return;
    const days = data.stats.days;
    const t = App.I18n.t;
    const fmt = App.Utils.formatDuration;

    const today = App.Utils.todayKey();
    const todaySeconds = (days[today] && days[today].seconds) || 0;
    const week = lastNDays(7).reduce((sum, d) => sum + ((days[d] && days[d].seconds) || 0), 0);
    const total = Object.values(days).reduce((sum, d) => sum + (d.seconds || 0), 0);

    $('stat-today').textContent = fmt(todaySeconds);
    $('stat-week').textContent = fmt(week);
    $('stat-total').textContent = fmt(total);
    $('stat-streak').textContent = t('stats.days', { n: data.stats.streak.current || 0 });

    // bars for the last 30 days
    const chart = $('stats-chart');
    chart.innerHTML = '';
    const range = lastNDays(30);
    const max = Math.max(60, ...range.map((d) => (days[d] && days[d].seconds) || 0));
    range.forEach((d) => {
      const seconds = (days[d] && days[d].seconds) || 0;
      const bar = document.createElement('div');
      bar.className = 'chart-bar' + (seconds ? '' : ' empty');
      const dayNum = Number(d.slice(8));
      bar.dataset.tip = `${d.slice(8)}.${d.slice(5, 7)}. – ${fmt(seconds)}`;
      bar.innerHTML = `<div class="bar" style="height:${Math.max(2, Math.round((seconds / max) * 100))}%"></div>` +
        (dayNum % 5 === 0 ? `<div class="bar-day">${dayNum}</div>` : '<div class="bar-day"></div>');
      chart.appendChild(bar);
    });

    // time per book
    const perBook = {};
    Object.values(days).forEach((d) => {
      Object.keys(d.perBook || {}).forEach((id) => {
        perBook[id] = (perBook[id] || 0) + d.perBook[id];
      });
    });
    const booksEl = $('stats-books');
    booksEl.innerHTML = '';
    const entries = Object.entries(perBook).sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (!entries.length) {
      booksEl.innerHTML = `<p class="empty-hint">${App.Utils.escapeHtml(t('stats.noData'))}</p>`;
    } else {
      entries.forEach(([id, seconds]) => {
        const rec = App.Store.getBook(id);
        const row = document.createElement('div');
        row.className = 'stats-book-row';
        row.innerHTML = `<span class="title">${App.Utils.escapeHtml(rec ? rec.title : '–')}</span>` +
          `<span class="time num">${fmt(seconds)}</span>`;
        booksEl.appendChild(row);
      });
    }

    $('dialog-stats').showModal();
  }

  return { startSession, endSession, recordActivity, totalForBook, showDialog };
})();
