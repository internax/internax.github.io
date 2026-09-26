/* Záložka Přehled: dosavadní rychlý přehled měsíce, bez židovských svátků. */
(function (root) {
  'use strict';
  const K = root.OC.kalendar;
  const el = id => document.getElementById(id);
  function setVal(id, v) { const i = el(id); if (document.activeElement !== i) i.value = v; }

  function render({ rows, employee, year, month0, normaMin, usedTotalWage }) {
    const key = K.monthKey(year, month0);
    const rowsForMonth = rows.filter(r => (employee ? r.employee === employee : true) && r.dateISO.slice(0, 7) === key);
    el('prehledPrazdny').classList.toggle('hidden', rowsForMonth.length > 0);
    el('prehledObsah').classList.toggle('hidden', rowsForMonth.length === 0);
    if (!rowsForMonth.length) return;

    setVal('prehledNormaH', Math.floor(normaMin / 60));
    setVal('prehledNormaM', normaMin % 60);
    const byDate = Object.fromEntries(rowsForMonth.map(r => [r.dateISO, r]));

    const czech = K.holidaysInMonth(year, month0);
    el('czechHolidays').innerHTML = czech.length
      ? `<div class="muted" style="margin-bottom:.3rem;">České státní svátky (odečítají se automaticky):</div><ul>${czech.map(h => `<li>${h.date.slice(8)}. – ${h.name}</li>`).join('')}</ul>`
      : '';
    el('noHolidays').classList.toggle('hidden', czech.length > 0);

    const dayList = K.monthDays(year, month0).map(d => ({ iso: d.iso, dow: d.dow, isWorkday: d.isWorkday, record: byDate[d.iso] || null }));
    const workdays = dayList.filter(d => d.isWorkday);
    const workdaysCount = workdays.length;

    let workedMinutes = 0;
    for (const d of workdays) if (d.record) workedMinutes += d.record.workedMinutes;

    // cutoff = poslední datum se záznamem v měsíci (hranice mezi „zatím“ a „zbývá“)
    const recordedDates = rowsForMonth.map(r => r.dateISO).sort();
    const cutoff = recordedDates[recordedDates.length - 1];
    const cutoffOpen = byDate[cutoff].isOpen;

    let remainingWorkdays = 0;
    for (const d of workdays) {
      if (d.iso > cutoff) remainingWorkdays++;
      else if (d.iso === cutoff && cutoffOpen) remainingWorkdays++;
    }

    const targetTotalMinutes = workdaysCount * normaMin;
    const remainingMinutes = targetTotalMinutes - workedMinutes;

    el('dataSourceNote').textContent = usedTotalWage
      ? 'Odpracované hodiny se počítají ze sloupce "Total Wage" (zahrnuje i placené absence); rozpracovaný den se dopočítává živě z In/Out.'
      : 'Soubor neobsahuje sloupec "Total Wage" — odpracované hodiny se počítají z rozdílu In/Out.';

    el('statWorkdays').textContent = workdaysCount;
    el('statWorked').textContent = K.fmtHM(workedMinutes);
    const remEl = el('statRemaining');
    remEl.textContent = remainingMinutes > 0 ? K.fmtHM(remainingMinutes) : ('splněno, +' + K.fmtHM(-remainingMinutes));
    remEl.className = 'value ' + (remainingMinutes > 0 ? '' : 'ok');

    const perDayEl = el('statPerDay');
    const warnBox = el('incompleteWarn');
    if (remainingMinutes <= 0) {
      perDayEl.textContent = '–';
      perDayEl.className = 'value';
      warnBox.classList.add('hidden');
    } else if (remainingWorkdays <= 0) {
      perDayEl.textContent = '–';
      perDayEl.className = 'value bad';
      warnBox.textContent = 'V měsíci už nezbývá dost pracovních dní na dosažení normy podle aktuálních dat.';
      warnBox.classList.remove('hidden');
    } else {
      perDayEl.textContent = K.fmtHM(remainingMinutes / remainingWorkdays);
      perDayEl.className = 'value';
      warnBox.classList.add('hidden');
    }

    const progressPct = targetTotalMinutes > 0 ? Math.min(100, Math.max(0, (workedMinutes / targetTotalMinutes) * 100)) : 0;
    el('progressBar').style.width = progressPct + '%';

    const tbody = el('dayTable');
    tbody.innerHTML = '';
    for (const d of dayList) {
      if (!d.isWorkday && !d.record) continue;
      const tr = document.createElement('tr');
      if (d.iso === cutoff) tr.classList.add('today');
      const dateLabel = `${d.iso.slice(8)}.${d.iso.slice(5, 7)}.`;
      let statusHtml, workedLabel;
      if (!d.isWorkday) {
        statusHtml = '<span class="tag missing">svátek</span>';
        workedLabel = d.record ? K.fmtHM(d.record.workedMinutes) : '–';
      } else if (!d.record) {
        statusHtml = '<span class="tag missing">bez záznamu</span>';
        workedLabel = '–';
      } else if (d.record.isOpen) {
        statusHtml = '<span class="tag open">v průběhu</span>';
        workedLabel = K.fmtHM(d.record.workedMinutes);
      } else {
        statusHtml = '<span class="tag ok">hotovo</span>';
        workedLabel = K.fmtHM(d.record.workedMinutes);
      }
      tr.innerHTML = `<td>${dateLabel}</td><td>${K.WEEKDAYS_CZ[d.dow]}</td><td>${workedLabel}</td><td>${statusHtml}</td>`;
      tbody.appendChild(tr);
    }
  }

  (root.OC = root.OC || {}).prehled = { render };
})(this);
