/* Ovládání stránky: export, výběr měsíce a zaměstnance, záložky, Plánovač, ukládání. */
(function (root) {
  'use strict';
  const { kalendar: K, xlsx: X, planovac: P, ics: I, ulozeni: U, prehled: PR } = root.OC;
  const el = id => document.getElementById(id);

  const STAVY = { prace: 'pracuji', dovolena: 'dovolená', nahradni: 'náhradní volno' };
  const DALSI_STAV = { prace: 'dovolena', dovolena: 'nahradni', nahradni: 'prace' };
  const ZNACKA = { export: '✓', bezZaznamu: '–', prace: '●', dovolena: 'D', nahradni: 'N' };

  let storage = null;
  try { storage = root.localStorage; } catch (e) { storage = null; }
  const ul = U.vytvorUloziste(storage);
  ul.migrace();

  const dnes = new Date();
  const stav = {
    rows: [], usedTotalWage: false, employee: null,
    year: dnes.getFullYear(), month0: dnes.getMonth(),
    nastaveni: ul.nactiNastaveni(),
    plany: {},                                   // 'YYYY-MM' -> úpravy (paměť i bez localStorage)
    zalozka: ul.cti('oc_zalozka') === 'planovac' ? 'planovac' : 'prehled',
  };

  /* ---------- pomocné ---------- */

  function employees() { return [...new Set(stav.rows.map(r => r.employee).filter(Boolean))]; }
  function rowsForEmployee() { return stav.employee ? stav.rows.filter(r => r.employee === stav.employee) : stav.rows; }
  function mesicKlic() { return K.monthKey(stav.year, stav.month0); }
  function upravy() {
    const k = mesicKlic();
    if (!(k in stav.plany)) stav.plany[k] = ul.nactiPlan(k);
    return stav.plany[k];
  }
  function setVal(id, v) { const i = el(id); if (document.activeElement !== i) i.value = v; }
  function td(obsah) {
    const c = document.createElement('td');
    if (obsah instanceof Node) c.appendChild(obsah); else c.textContent = obsah;
    return c;
  }
  function datumText(iso) { return `${Number(iso.slice(8))}. ${Number(iso.slice(5, 7))}.`; }

  function zmenUpravu(iso, zmena) {
    const u = upravy();
    const den = { ...(u[iso] || {}), ...zmena };
    for (const k of Object.keys(den)) if (den[k] === undefined) delete den[k];
    if (Object.keys(den).length) u[iso] = den; else delete u[iso];
    ul.ulozPlan(mesicKlic(), u);
    renderSFokusem();
  }

  // Překreslení po změně v tabulce vrátí fokus na prvek se stejným aria-label.
  // Odloženo o jeden tik, aby Tab stihl přesunout fokus na další pole.
  function renderSFokusem() {
    setTimeout(() => {
      const aktivni = document.activeElement;
      const popis = aktivni && aktivni.getAttribute ? aktivni.getAttribute('aria-label') : null;
      render();
      if (!popis) return;
      const cil = document.querySelector(`[aria-label="${CSS.escape(popis)}"]`);
      if (cil) cil.focus();
    }, 0);
  }

  function spocitej() {
    return P.naplanuj({ rok: stav.year, mesic0: stav.month0, zaznamy: rowsForEmployee(),
      nastaveni: stav.nastaveni, upravy: upravy() });
  }

  /* ---------- vykreslení ---------- */

  function render() {
    el('mesicNazev').textContent = `${K.MONTHS_CZ[stav.month0]} ${stav.year}`;
    const emps = employees();
    el('employeeBlock').classList.toggle('hidden', emps.length <= 1);
    const sel = el('employeeSelect');
    sel.innerHTML = '';
    for (const e of emps) { const o = document.createElement('option'); o.value = e; o.textContent = e; sel.appendChild(o); }
    if (stav.employee) sel.value = stav.employee;
    for (const z of ['prehled', 'planovac']) {
      el('tab-' + z).setAttribute('aria-selected', String(stav.zalozka === z));
      el('panel-' + z).classList.toggle('hidden', stav.zalozka !== z);
    }
    if (stav.zalozka === 'prehled') {
      PR.render({ rows: stav.rows, employee: stav.employee, year: stav.year, month0: stav.month0,
        normaMin: stav.nastaveni.normaMin, usedTotalWage: stav.usedTotalWage });
    } else {
      renderPlanovac();
    }
  }

  function renderPlanovac() {
    const n = stav.nastaveni;
    setVal('normaH', Math.floor(n.normaMin / 60));
    setVal('normaM', n.normaMin % 60);
    setVal('prichodVychozi', K.fmtTimeInput(n.prichodMin));
    setVal('pauzaMin', n.pauzaMin);
    el('cestaTamZap').checked = n.cestaTamZap;
    setVal('cestaTamMin', n.cestaTamMin);
    el('cestaZpetZap').checked = n.cestaZpetZap;
    setVal('cestaZpetMin', n.cestaZpetMin);

    const { dny, souhrn } = spocitej();
    renderSouhrn(souhrn);
    renderKalendar(dny);
    renderTabulka(dny);
    el('icsBtn').disabled = !dny.some(d => d.druh === 'plan' && d.stav === 'prace' && d.hodinyMin > 0);
  }

  function renderSouhrn(s) {
    el('pFond').textContent = K.fmtHM(s.fondMin);
    el('pOdpracovano').textContent = K.fmtHM(s.odpracovanoMin);
    el('pDovolena').textContent = K.fmtHM(s.dovolenaMin);
    const zb = el('pZbyva');
    zb.textContent = s.splneno ? 'splněno, +' + K.fmtHM(-s.zbyvaMin) : K.fmtHM(s.zbyvaMin);
    zb.className = 'value' + (s.splneno ? ' ok' : '');
    el('pNaDen').textContent = s.naDenMin != null ? K.fmtHM(s.naDenMin) : '–';
    const pct = s.fondMin > 0 ? Math.min(100, Math.max(0, (s.odpracovanoMin + s.dovolenaMin) / s.fondMin * 100)) : 0;
    el('pProgress').style.width = pct + '%';
    const w = el('pVarovani');
    w.textContent = s.varovani.join(' ');
    w.classList.toggle('hidden', !s.varovani.length);
  }

  function renderKalendar(dny) {
    const g = el('kalendar');
    g.innerHTML = '';
    for (const h of ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']) {
      const c = document.createElement('div'); c.className = 'kal-hlavicka'; c.textContent = h; g.appendChild(c);
    }
    const posun = (dny[0].dow + 6) % 7;            // pondělí = 0
    for (let i = 0; i < posun; i++) g.appendChild(document.createElement('div'));
    for (const d of dny) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kal-den kal-' + (d.druh === 'plan' ? d.stav : d.druh);
      let znacka = '';
      if (d.druh === 'plan') znacka = d.rozpracovany && d.stav === 'prace' ? '◐' : ZNACKA[d.stav];
      else if (d.druh === 'export' || d.druh === 'bezZaznamu') znacka = ZNACKA[d.druh];
      b.innerHTML = `<span>${Number(d.iso.slice(8))}</span><span class="kal-znacka">${znacka}</span>`;
      if (d.svatek) b.title = d.svatek;
      if (d.druh === 'plan') {
        b.setAttribute('aria-label', `${datumText(d.iso)} ${STAVY[d.stav]}`);
        b.addEventListener('click', () => {
          const dalsi = DALSI_STAV[d.stav];
          zmenUpravu(d.iso, { stav: dalsi === 'prace' ? undefined : dalsi });
        });
      } else {
        b.disabled = true;
      }
      g.appendChild(b);
    }
  }

  function renderTabulka(dny) {
    const tb = el('planTabulka');
    tb.innerHTML = '';
    for (const d of dny) {
      if (d.druh === 'vikend' || d.druh === 'svatek') continue;
      const tr = document.createElement('tr');
      tr.appendChild(td(datumText(d.iso) + (d.rozpracovany ? ' ◐' : '')));
      tr.appendChild(td(K.WEEKDAYS_CZ[d.dow]));

      if (d.druh !== 'plan') {
        tr.className = 'jen-cteni';
        tr.appendChild(td(d.druh === 'export' ? 'hotovo' : 'bez záznamu'));
        tr.appendChild(td(d.druh === 'export' ? K.fmtClock(d.hodinyMin) : '–'));
        for (let i = 0; i < 3; i++) tr.appendChild(td('–'));
        tb.appendChild(tr);
        continue;
      }

      const sel = document.createElement('select');
      for (const [k, t] of Object.entries(STAVY)) {
        const o = document.createElement('option'); o.value = k; o.textContent = t; sel.appendChild(o);
      }
      sel.value = d.stav;
      sel.setAttribute('aria-label', 'Stav ' + datumText(d.iso));
      sel.addEventListener('change', () => zmenUpravu(d.iso, { stav: sel.value === 'prace' ? undefined : sel.value }));
      tr.appendChild(td(sel));

      if (d.stav !== 'prace') {
        for (let i = 0; i < 4; i++) tr.appendChild(td('–'));
        tb.appendChild(tr);
        continue;
      }

      const hod = document.createElement('input');
      hod.type = 'text';
      hod.className = 'hodiny';
      hod.value = K.fmtClock(d.hodinyMin);
      hod.setAttribute('aria-label', 'Hodiny ' + datumText(d.iso));
      hod.addEventListener('change', () => {
        const v = K.parseClock(hod.value);
        if (v == null) renderSFokusem(); else zmenUpravu(d.iso, { hodinyMin: v });
      });
      const bunka = td(hod);
      if (d.zamceno) {
        const r = document.createElement('button');
        r.type = 'button';
        r.className = 'reset';
        r.textContent = '🔒 ↺';
        r.title = 'Vrátit na automatický výpočet';
        r.addEventListener('click', () => zmenUpravu(d.iso, { hodinyMin: undefined }));
        bunka.appendChild(r);
      }
      tr.appendChild(bunka);

      const pr = document.createElement('input');
      pr.type = 'time';
      pr.value = K.fmtTimeInput(d.prichodMin);
      pr.setAttribute('aria-label', 'Příchod ' + datumText(d.iso));
      // ukládá se až při opuštění pole – prohlížeče hlásí change už během psaní
      pr.addEventListener('blur', () => {
        const v = K.parseClock(pr.value);
        if (v == null) renderSFokusem();
        else if (v !== d.prichodMin) zmenUpravu(d.iso, { prichodMin: v });
      });
      pr.addEventListener('keydown', e => { if (e.key === 'Enter') pr.blur(); });
      tr.appendChild(td(pr));

      const pa = document.createElement('input');
      pa.type = 'checkbox';
      pa.checked = d.pauza;
      pa.setAttribute('aria-label', 'Pauza ' + datumText(d.iso));
      pa.addEventListener('change', () => zmenUpravu(d.iso, { pauza: pa.checked ? undefined : false }));
      tr.appendChild(td(pa));

      tr.appendChild(td(d.odchodMin != null ? K.fmtTimeInput(d.odchodMin) : '–'));
      tb.appendChild(tr);
    }
  }

  /* ---------- akce ---------- */

  function cislo(id, min, max) {
    const v = parseInt(el(id).value, 10);
    return Number.isFinite(v) && v >= min && v <= max ? v : null;
  }

  function zmenNastaveni() {
    const n = stav.nastaveni;
    const h = cislo('normaH', 0, 23), m = cislo('normaM', 0, 59);
    if (h != null && m != null) n.normaMin = h * 60 + m;
    const pauza = cislo('pauzaMin', 0, 240); if (pauza != null) n.pauzaMin = pauza;
    const tam = cislo('cestaTamMin', 0, 240); if (tam != null) n.cestaTamMin = tam;
    const zpet = cislo('cestaZpetMin', 0, 240); if (zpet != null) n.cestaZpetMin = zpet;
    const prichod = K.parseClock(el('prichodVychozi').value); if (prichod != null) n.prichodMin = prichod;
    n.cestaTamZap = el('cestaTamZap').checked;
    n.cestaZpetZap = el('cestaZpetZap').checked;
    ul.ulozNastaveni(n);
    render();
  }

  function zmenNormuPrehledu() {
    const h = cislo('prehledNormaH', 0, 23), m = cislo('prehledNormaM', 0, 59);
    if (h == null || m == null) return;
    stav.nastaveni.normaMin = h * 60 + m;
    ul.ulozNastaveni(stav.nastaveni);
    render();
  }

  function stahniIcs() {
    const { dny } = spocitej();
    const text = I.vytvorIcs(dny, stav.nastaveni, new Date());
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = I.nazevSouboru(stav.year, stav.month0);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function obnovPlan() {
    if (!confirm(`Smazat všechny úpravy plánu pro ${K.MONTHS_CZ[stav.month0]} ${stav.year}?`)) return;
    stav.plany[mesicKlic()] = {};
    ul.smazPlan(mesicKlic());
    render();
  }

  async function handleFile(file) {
    el('fileError').classList.add('hidden');
    try {
      const rows = await X.parseWorkbook(await file.arrayBuffer());
      if (!rows.length) throw new Error('V souboru jsem nenašel žádné řádky s daty.');
      stav.rows = rows;
      stav.usedTotalWage = rows.usedTotalWage;
      const emps = employees();
      stav.employee = emps.length ? emps[0] : null;
      const posledni = rowsForEmployee().map(r => r.dateISO).sort().pop();
      stav.year = Number(posledni.slice(0, 4));
      stav.month0 = Number(posledni.slice(5, 7)) - 1;
      el('fileInfo').textContent = `Načteno: export do ${datumText(posledni)} ${posledni.slice(0, 4)}, ${rows.length} řádků.`;
      el('fileInfo').classList.remove('hidden');
      render();
    } catch (err) {
      console.error(err);
      el('fileError').textContent = 'Nepodařilo se zpracovat soubor: ' + err.message;
      el('fileError').classList.remove('hidden');
    }
  }

  function posunMesic(delta) {
    const m = K.addMonths(stav.year, stav.month0, delta);
    stav.year = m.year;
    stav.month0 = m.month0;
    render();
  }

  function zvolZalozku(z) {
    stav.zalozka = z;
    ul.pis('oc_zalozka', z);
    render();
  }

  /* ---------- start ---------- */

  function init() {
    const drop = el('drop'), fileInput = el('fileInput');
    if (typeof DecompressionStream === 'undefined' || typeof DOMParser === 'undefined') {
      el('fileError').textContent = 'Tvůj prohlížeč neumí načíst export. Plánovač funguje i bez něj; pro export zkus aktuální Chrome, Edge, Firefox nebo Safari.';
      el('fileError').classList.remove('hidden');
      drop.classList.add('hidden');
    } else {
      drop.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
      drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('drag');
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      });
    }

    el('mesicPred').addEventListener('click', () => posunMesic(-1));
    el('mesicDalsi').addEventListener('click', () => posunMesic(1));
    el('employeeSelect').addEventListener('change', e => { stav.employee = e.target.value; render(); });
    el('tab-prehled').addEventListener('click', () => zvolZalozku('prehled'));
    el('tab-planovac').addEventListener('click', () => zvolZalozku('planovac'));

    for (const id of ['normaH', 'normaM', 'pauzaMin', 'cestaTamMin', 'cestaZpetMin']) el(id).addEventListener('input', zmenNastaveni);
    for (const id of ['prichodVychozi', 'cestaTamZap', 'cestaZpetZap']) el(id).addEventListener('change', zmenNastaveni);
    for (const id of ['prehledNormaH', 'prehledNormaM']) el(id).addEventListener('input', zmenNormuPrehledu);

    el('icsBtn').addEventListener('click', stahniIcs);
    el('resetBtn').addEventListener('click', obnovPlan);

    render();
  }

  init();
})(this);
