/* Kalendář a čas: české svátky, pracovní dny, převody minut a textu. Bez DOM. */
(function (root) {
  'use strict';

  const WEEKDAYS_CZ = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  const MONTHS_CZ = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];

  function toISO(date) { return date.toISOString().slice(0, 10); }
  function dISO(y, m0, d) { return toISO(new Date(Date.UTC(y, m0, d))); }
  function monthKey(year, month0) { return `${year}-${String(month0 + 1).padStart(2, '0')}`; }
  function daysInMonth(year, month0) { return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate(); }
  function addMonths(year, month0, delta) {
    const d = new Date(Date.UTC(year, month0 + delta, 1));
    return { year: d.getUTCFullYear(), month0: d.getUTCMonth() };
  }

  function easterSundayUTC(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
  }

  function czechHolidays(year) {
    const easter = easterSundayUTC(year);
    const goodFriday = new Date(easter); goodFriday.setUTCDate(easter.getUTCDate() - 2);
    const easterMonday = new Date(easter); easterMonday.setUTCDate(easter.getUTCDate() + 1);
    return [
      { date: dISO(year, 0, 1), name: 'Nový rok / Den obnovy samostatného českého státu' },
      { date: toISO(goodFriday), name: 'Velký pátek' },
      { date: toISO(easterMonday), name: 'Velikonoční pondělí' },
      { date: dISO(year, 4, 1), name: 'Svátek práce' },
      { date: dISO(year, 4, 8), name: 'Den vítězství' },
      { date: dISO(year, 6, 5), name: 'Den slovanských věrozvěstů Cyrila a Metoděje' },
      { date: dISO(year, 6, 6), name: 'Den upálení mistra Jana Husa' },
      { date: dISO(year, 8, 28), name: 'Den české státnosti' },
      { date: dISO(year, 9, 28), name: 'Den vzniku samostatného československého státu' },
      { date: dISO(year, 10, 17), name: 'Den boje za svobodu a demokracii' },
      { date: dISO(year, 11, 24), name: 'Štědrý den' },
      { date: dISO(year, 11, 25), name: '1. svátek vánoční' },
      { date: dISO(year, 11, 26), name: '2. svátek vánoční' },
    ];
  }

  function holidaysInMonth(year, month0) {
    const key = monthKey(year, month0);
    return czechHolidays(year).filter(h => h.date.slice(0, 7) === key);
  }

  function monthDays(year, month0) {
    const holidays = new Map(holidaysInMonth(year, month0).map(h => [h.date, h.name]));
    const out = [];
    for (let d = 1; d <= daysInMonth(year, month0); d++) {
      const iso = dISO(year, month0, d);
      const dow = new Date(Date.UTC(year, month0, d)).getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      const holiday = holidays.get(iso) || null;
      out.push({ iso, dow, isWeekend, holiday, isWorkday: !isWeekend && !holiday });
    }
    return out;
  }

  function fmtHM(min) {
    const sign = min < 0 ? '-' : '';
    min = Math.round(Math.abs(min));
    return `${sign}${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
  }
  function fmtClock(min) {
    const sign = min < 0 ? '-' : '';
    min = Math.round(Math.abs(min));
    return `${sign}${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  }
  function fmtTimeInput(min) {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
  function parseClock(text) {
    const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(String(text ?? '').trim());
    if (!m) return null;
    const minutes = m[2] ? parseInt(m[2], 10) : 0;
    if (minutes > 59) return null;
    return parseInt(m[1], 10) * 60 + minutes;
  }

  const api = { WEEKDAYS_CZ, MONTHS_CZ, monthKey, addMonths, daysInMonth, czechHolidays, holidaysInMonth,
    monthDays, fmtHM, fmtClock, fmtTimeInput, parseClock };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.OC = root.OC || {}).kalendar = api;
})(this);
