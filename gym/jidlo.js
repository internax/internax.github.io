/* Záložka Jídlo: přehled dne proti cíli, potraviny po skupinách s porcemi po půlkách, vlastní položky,
   statistika za 28 dní. O půlnoci se sama přepne na nový den. */
(function (root) {
  'use strict';
  const { vyziva: V, prumery: P, konfigurace: KONF } = root.GYM;
  const el = id => document.getElementById(id);
  const CIL = KONF.cileJidla;
  const NAZVY = { kcal: 'Kalorie', bilkoviny: 'Bílkoviny', sacharidy: 'Sacharidy', tuky: 'Tuky' };

  const datumCesky = iso => { const [r, m, d] = iso.split('-'); return `${Number(d)}. ${Number(m)}. ${r}`; };
  const porceText = p => p.toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) + '×';
  const barva = nazev => getComputedStyle(document.documentElement).getPropertyValue(nazev).trim();

  function prvek(tag, trida, text) {
    const e = document.createElement(tag);
    if (trida) e.className = trida;
    if (text != null) e.textContent = text;
    return e;
  }
  function tlacitko(text, trida, fn, popisek) {
    const b = prvek('button', trida, text);
    b.type = 'button';
    if (popisek) b.setAttribute('aria-label', popisek);
    b.addEventListener('click', fn);
    return b;
  }

  function vytvorJidlo(data) {
    let den = P.mistniDatum();
    let potraviny = [];             // aktivní, v pořadí katalogu
    let mapa = new Map();           // id → potravina (i vyřazené, kvůli starším dnům)
    let radky = [];                 // záznamy zobrazeného dne
    let statistika = [];            // záznamy za posledních 28 dní (bez zobrazeného dne, ten je v `radky`)
    let graf = null;
    const fronta = new Map();       // potravina_id → porce čekající na odeslání (posílá se jen poslední hodnota)
    let odesilam = false;
    let poznamkaUlozena = '';       // poslední uložený text poznámky dne
    let casovacPoznamky = null;

    function ukazChybu(text) {
      el('jidloChyba').textContent = text;
      el('jidloChyba').classList.toggle('hidden', !text);
    }

    /* ---------- načtení a přepínání dní ---------- */

    async function nacti() {
      const dnes = P.mistniDatum();
      const od = P.posunDatum(dnes, -27);
      try {
        const [p, zaznamy] = await Promise.all([
          potraviny.length ? Promise.resolve(null) : data.nactiPotraviny(),
          data.nactiJidlo(den < od ? den : od, dnes),
        ]);
        if (p) { mapa = new Map(p.map(x => [x.id, x])); potraviny = p.filter(x => x.aktivni); }
        radky = zaznamy.filter(z => z.datum === den);
        poznamkaUlozena = await data.nactiPoznamkuJidla(den);
        el('jidloPoznamka').value = poznamkaUlozena;
        el('poznamkaStav').textContent = '';
        statistika = zaznamy.filter(z => z.datum !== den && z.datum >= od);
        ukazChybu('');
      } catch (e) {
        ukazChybu('Nepodařilo se načíst jídlo: ' + e.message);
      }
      vykresli();
    }

    function prejdiNa(novyDen) {
      if (novyDen > P.mistniDatum()) return;
      den = novyDen;
      nacti();
    }

    // o půlnoci (nebo po návratu do aplikace) přejít na nový den, pokud byl zobrazený dnešek
    let posledniDnes = P.mistniDatum();
    function hlidejPulnoc() {
      const dnes = P.mistniDatum();
      if (dnes === posledniDnes) return;
      const bylDnes = den === posledniDnes;
      posledniDnes = dnes;
      if (bylDnes) prejdiNa(dnes);
    }

    /* ---------- změny ---------- */

    function porceDne(potravinaId) {
      const r = radky.find(x => Number(x.potravina_id) === potravinaId);
      return r ? Number(r.porce) : 0;
    }

    function zmenPorci(potravina, smer) {
      const nova = V.posunPorce(porceDne(potravina.id), smer);
      const i = radky.findIndex(x => Number(x.potravina_id) === potravina.id);
      if (nova <= 0) { if (i >= 0) radky.splice(i, 1); }
      else if (i >= 0) radky[i] = { ...radky[i], porce: nova };
      else radky.push({ datum: den, potravina_id: potravina.id, porce: nova });
      fronta.set(potravina.id, { datum: den, porce: nova });
      vykresli();
      odesli();
    }

    async function odesli() {
      if (odesilam) return;
      odesilam = true;
      try {
        while (fronta.size) {
          const [id, { datum, porce }] = fronta.entries().next().value;
          fronta.delete(id);
          await data.ulozPorce(datum, id, porce);
        }
        ukazChybu('');
      } catch (e) {
        fronta.clear();
        ukazChybu('Uložení se nepovedlo (' + e.message + '). Načítám znovu, zkontroluj poslední změnu.');
        odesilam = false;
        return nacti();
      }
      odesilam = false;
    }

    async function pridatVlastni(udalost) {
      udalost.preventDefault();
      const cislo = id => { const s = el(id).value.trim().replace(',', '.'); return s === '' ? null : Number(s); };
      const nazev = el('vlastniNazev').value.trim();
      const hodnoty = { kcal: cislo('vlastniKcal'), bilkoviny: cislo('vlastniB'), sacharidy: cislo('vlastniS'), tuky: cislo('vlastniT') };
      if (!nazev) return ukazChybu('Napiš název vlastní položky.');
      if (!(hodnoty.kcal >= 0) || Object.values(hodnoty).some(v => v != null && !(v >= 0 && v < 10000))) {
        return ukazChybu('Kalorie jsou povinné, všechna čísla nezáporná.');
      }
      try {
        const id = await data.pridejVlastni(den, { nazev, ...hodnoty });
        radky.push({ id, datum: den, potravina_id: null, porce: 1, nazev, ...hodnoty });
        el('vlastniForm').reset();
        el('vlastniDetail').open = false;
        ukazChybu('');
        vykresli();
      } catch (e) {
        ukazChybu('Přidání se nepovedlo: ' + e.message);
      }
    }

    // poznámka ke dni se ukládá sama: chvíli po dopsání a při opuštění políčka
    async function ulozPoznamku() {
      clearTimeout(casovacPoznamky);
      const text = el('jidloPoznamka').value;
      if (text === poznamkaUlozena) return;
      const datum = den;
      el('poznamkaStav').textContent = 'Ukládám…';
      try {
        await data.ulozPoznamkuJidla(datum, text);
        if (datum === den) { poznamkaUlozena = text; el('poznamkaStav').textContent = 'Uloženo'; }
      } catch (e) {
        el('poznamkaStav').textContent = 'Neuloženo: ' + e.message;
      }
    }

    async function smazatVlastni(radek) {
      if (!root.confirm(`Smazat „${radek.nazev}“?`)) return;
      try {
        await data.smazJidlo(radek.id);
        radky = radky.filter(r => r !== radek);
        vykresli();
      } catch (e) {
        ukazChybu('Smazání se nepovedlo: ' + e.message);
      }
    }

    /* ---------- vykreslení ---------- */

    function vykresliPrehled() {
      const dnes = P.mistniDatum();
      el('jidloDatum').textContent = den === dnes ? 'Dnes' : den === P.posunDatum(dnes, -1) ? 'Včera' : datumCesky(den);
      el('jidloDalsi').disabled = den >= dnes;
      const s = V.soucet(radky, mapa);
      for (const k of V.MAKRA) {
        const procento = Math.min(100, (s[k] / CIL[k]) * 100);
        el('jidlo-' + k).textContent = k === 'kcal'
          ? `${V.cesky(s.kcal)} / ${V.cesky(CIL.kcal)} kcal`
          : `${V.cesky(s[k])} / ${CIL[k]} g`;
        const pruh = el('pruh-' + k);
        pruh.style.width = procento + '%';
        pruh.classList.toggle('splneno', s[k] >= CIL[k] * 0.95);
      }
      const zbyva = CIL.kcal - s.kcal;
      el('jidloZbyva').textContent = zbyva > 0 ? `Zbývá ${V.cesky(zbyva)} kcal` : `Cíl splněn (+${V.cesky(-zbyva)} kcal)`;
    }

    function vykresliSeznam() {
      const obal = el('jidloSeznam');
      obal.replaceChildren();
      const skupiny = [];
      for (const p of potraviny) {
        let s = skupiny.find(x => x.nazev === p.skupina);
        if (!s) skupiny.push(s = { nazev: p.skupina, polozky: [] });
        s.polozky.push(p);
      }
      for (const s of skupiny) {
        const karta = prvek('div', 'card jidlo-skupina');
        karta.append(prvek('h2', null, s.nazev));
        const ul = prvek('ul', 'potraviny');
        for (const p of s.polozky) {
          const porce = porceDne(p.id);
          const li = prvek('li', porce > 0 ? 'snedeno' : '');
          const popis = prvek('div', 'potravina-popis');
          popis.append(prvek('span', 'potravina-nazev', p.nazev),
            prvek('span', 'muted', `${p.porce_popis} · ${V.cesky(p.kcal)} kcal · B ${V.cesky(p.bilkoviny)} g`));
          const ovl = prvek('div', 'porce-ovladani');
          ovl.append(
            tlacitko('−', 'krok', () => zmenPorci(p, -1), `Ubrat půl porce: ${p.nazev}`),
            prvek('strong', 'porce', porce > 0 ? porceText(porce) : '–'),
            tlacitko('+', 'krok', () => zmenPorci(p, 1), `Přidat půl porce: ${p.nazev}`));
          li.append(popis, ovl);
          ul.append(li);
        }
        karta.append(ul);
        obal.append(karta);
      }
      // vlastní položky dne
      const vlastni = radky.filter(r => r.potravina_id == null);
      const seznam = el('vlastniSeznam');
      seznam.replaceChildren();
      for (const r of vlastni) {
        const li = prvek('li');
        li.append(prvek('span', null, r.nazev),
          prvek('span', 'muted', `${V.cesky(Number(r.kcal))} kcal` + (r.bilkoviny != null ? ` · B ${V.cesky(Number(r.bilkoviny))} g` : '')),
          tlacitko('×', 'odkaz', () => smazatVlastni(r), 'Smazat ' + r.nazev));
        seznam.append(li);
      }
      el('vlastniPrazdne').classList.toggle('hidden', vlastni.length > 0);
    }

    function vykresliStatistiku() {
      const dnes = P.mistniDatum();
      const dny = V.poDnech([...statistika, ...radky], mapa).filter(d => d.datum > P.posunDatum(dnes, -28));
      const p7 = V.prumer(dny, P.posunDatum(dnes, -6), dnes);
      const p28 = V.prumer(dny, P.posunDatum(dnes, -27), dnes);
      const text = (p, nazev) => p ? `${nazev}: ${V.cesky(p.kcal)} kcal, B ${V.cesky(p.bilkoviny)} g (${p.dnu} ${p.dnu === 1 ? 'den' : p.dnu < 5 ? 'dny' : 'dní'})` : `${nazev}: zatím nic`;
      el('jidloPrumery').textContent = `${text(p7, 'Průměr 7 dní')} · ${text(p28, '28 dní')}`;
      el('jidloGrafObal').classList.toggle('hidden', dny.length === 0);
      if (!dny.length || !root.Chart || el('panel-jidlo').classList.contains('hidden')) return;
      const ok = barva('--ok'), stred = barva('--stred'), muted = barva('--muted'), mrizka = barva('--border');
      const barvaDne = k => (k >= CIL.kcal * 0.9 ? ok : stred);
      if (graf) graf.destroy();
      graf = new root.Chart(el('jidloGraf'), {
        data: {
          labels: dny.map(d => { const [, m, dd] = d.datum.split('-'); return `${Number(dd)}. ${Number(m)}.`; }),
          datasets: [
            { type: 'bar', label: 'Kalorie', data: dny.map(d => d.kcal), backgroundColor: dny.map(d => barvaDne(d.kcal) + '99'),
              borderColor: dny.map(d => barvaDne(d.kcal)), borderWidth: 1, borderRadius: 4, maxBarThickness: 22 },
            { type: 'line', label: 'Cíl', data: dny.map(() => CIL.kcal), borderColor: muted, borderWidth: 1, borderDash: [4, 4], pointRadius: 0 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { filter: p => p.datasetIndex === 0, callbacks: {
            label: p => { const d = dny[p.dataIndex]; return `${V.cesky(d.kcal)} kcal · B ${V.cesky(d.bilkoviny)} · S ${V.cesky(d.sacharidy)} · T ${V.cesky(d.tuky)} g`; },
          } } },
          scales: {
            x: { ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { color: muted, maxTicksLimit: 5, callback: v => V.cesky(v) }, grid: { color: mrizka } },
          },
        },
      });
    }

    function vykresli() {
      vykresliPrehled();
      vykresliSeznam();
      vykresliStatistiku();
    }

    function spust() {
      el('jidloPred').addEventListener('click', async () => { await ulozPoznamku(); prejdiNa(P.posunDatum(den, -1)); });
      el('jidloDalsi').addEventListener('click', async () => { await ulozPoznamku(); prejdiNa(P.posunDatum(den, 1)); });
      el('jidloPoznamka').addEventListener('input', () => {
        el('poznamkaStav').textContent = '';
        clearTimeout(casovacPoznamky);
        casovacPoznamky = setTimeout(ulozPoznamku, 1200);
      });
      el('jidloPoznamka').addEventListener('blur', ulozPoznamku);
      el('vlastniForm').addEventListener('submit', pridatVlastni);
      setInterval(hlidejPulnoc, 60000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') hlidejPulnoc(); });
    }

    // graf jde nakreslit jen do viditelného panelu
    function priZobrazeni() { hlidejPulnoc(); vykresliStatistiku(); }

    return { spust, nacti, priZobrazeni };
  }

  (root.GYM = root.GYM || {}).jidlo = { vytvorJidlo };
})(this);
