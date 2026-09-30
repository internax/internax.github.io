/* Záložka Progres: graf váhy (vážení a průměr), graf síly vybraného cviku, přehled cviků a pocitů. */
(function (root) {
  'use strict';
  const { prumery: P, progrese: PG, souhrn: S } = root.GYM;
  const el = id => document.getElementById(id);

  const DEN_MS = 86400000;
  const naDen = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / DEN_MS);
  const zeDne = den => { const d = new Date(den * DEN_MS); return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`; };
  const cislo = (x, des = 1) => x.toLocaleString('cs-CZ', { maximumFractionDigits: des });
  const barva = nazev => getComputedStyle(document.documentElement).getPropertyValue(nazev).trim();

  function prvek(tag, trida, text) {
    const e = document.createElement(tag);
    if (trida) e.className = trida;
    if (text != null) e.textContent = text;
    return e;
  }

  // společné nastavení grafů: osa x ve dnech, popisky jako datum, barvy z CSS (světlý i tmavý režim)
  function nastaveniGrafu(jednotka) {
    const muted = barva('--muted'), mrizka = barva('--border');
    return {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: polozky => zeDne(polozky[0].parsed.x),
          label: p => `${p.dataset.label}: ${cislo(p.parsed.y)} ${jednotka}`,
        } },
      },
      scales: {
        x: { type: 'linear', ticks: { color: muted, maxTicksLimit: 5, callback: zeDne }, grid: { color: mrizka } },
        y: { ticks: { color: muted, maxTicksLimit: 5 }, grid: { color: mrizka } },
      },
    };
  }

  function vytvorProgres(data) {
    const grafy = {};
    let vybrany = null;                // id cviku v grafu síly
    let stav = { vazeni: [], zaznamy: [], treninky: new Map(), cviky: new Map() };

    function nakresli(id, konfigurace) {
      if (grafy[id]) grafy[id].destroy();
      grafy[id] = new root.Chart(el(id), konfigurace);
    }

    function ukazChybu(text) {
      el('progresChyba').textContent = text;
      el('progresChyba').classList.toggle('hidden', !text);
    }

    /* ---------- váha ---------- */

    function vykresliVahu() {
      const prumery = P.klouzavyPrumer(stav.vazeni);
      el('grafVahaObal').classList.toggle('hidden', prumery.length < 2);
      el('vahaPrazdna').classList.toggle('hidden', prumery.length >= 2);
      const trend = P.tydenniTrend(stav.vazeni);
      el('vahaShrnuti').textContent = !prumery.length ? '' :
        `Průměr ${cislo(prumery[prumery.length - 1].prumer)} kg` +
        (trend == null ? '' : ` · trend ${trend >= 0 ? '+' : '−'}${cislo(Math.abs(trend), 2)} kg za týden`);
      if (prumery.length < 2 || !root.Chart) return;
      const akcent = barva('--accent'), muted = barva('--muted');
      nakresli('grafVaha', {
        type: 'line',
        data: { datasets: [
          { label: 'Vážení', data: prumery.map(p => ({ x: naDen(p.datum), y: p.hmotnost_kg })), showLine: false,
            pointRadius: 3, pointBackgroundColor: muted, borderColor: muted },
          { label: 'Průměr 7 dní', data: prumery.map(p => ({ x: naDen(p.datum), y: p.prumer })),
            borderColor: akcent, backgroundColor: akcent, borderWidth: 2.5, pointRadius: 0, tension: 0.3 },
        ] },
        options: nastaveniGrafu('kg'),
      });
    }

    /* ---------- síla ---------- */

    // cvik_id → [{ den, vykon, zaznam }] od nejstaršího
    function vykonyPodleCviku() {
      const podle = new Map();
      for (const z of stav.zaznamy) {
        const t = stav.treninky.get(z.trenink_id);
        const v = PG.vykon(z);
        if (!t || !v) continue;
        if (!podle.has(z.cvik_id)) podle.set(z.cvik_id, []);
        podle.get(z.cvik_id).push({ den: naDen(t.datum), vykon: v, zaznam: z });
      }
      // víc záznamů stejného cviku v jeden den (dva tréninky) → jen ten lepší, jinak se křivka vrací
      for (const [id, seznam] of podle) {
        const dny = new Map();
        for (const b of seznam) if (!dny.has(b.den) || b.vykon.hodnota > dny.get(b.den).vykon.hodnota) dny.set(b.den, b);
        podle.set(id, [...dny.values()].sort((a, b) => a.den - b.den));
      }
      return podle;
    }

    function vykresliSilu() {
      const podle = vykonyPodleCviku();
      const seznam = el('seznamCviku');
      seznam.replaceChildren();
      el('silaPrazdna').classList.toggle('hidden', podle.size > 0);
      el('grafSilaObal').classList.toggle('hidden', podle.size === 0);
      if (!podle.size) return;
      if (!podle.has(vybrany)) vybrany = [...podle.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];

      for (const [cvikId, body] of podle) {
        const posledni = body[body.length - 1].vykon;
        const zmena = PG.zmenaVykonu(body.map(b => b.zaznam));
        const li = prvek('li', cvikId === vybrany ? 'vybrany' : '');
        const b = prvek('button', 'radek-cviku');
        b.type = 'button';
        b.append(prvek('span', 'nazev', stav.cviky.get(cvikId) || 'Cvik ' + cvikId));
        const pravo = prvek('span', 'hodnoty');
        pravo.append(prvek('span', 'muted', `${cislo(posledni.hodnota)} ${posledni.jednotka === 'kg' ? 'kg' : 'opak.'}`));
        if (zmena != null) pravo.append(prvek('strong', zmena > 0 ? 'plus' : zmena < 0 ? 'minus' : '', `${zmena >= 0 ? '+' : '−'}${cislo(Math.abs(zmena), 0)} %`));
        b.append(pravo);
        b.addEventListener('click', () => { vybrany = cvikId; vykresliSilu(); });
        li.append(b);
        seznam.append(li);
      }

      const body = podle.get(vybrany);
      const jednotka = body[body.length - 1].vykon.jednotka === 'kg' ? 'kg' : 'opak.';
      el('silaNadpis').textContent = stav.cviky.get(vybrany) || '';
      el('silaVysvetleni').textContent = jednotka === 'kg'
        ? 'Odhad maxima na 1 opakování z nejlepší série – roste, když přidáš váhu i opakování.'
        : 'Součet opakování ve všech sériích.';
      if (!root.Chart) return;
      const ok = barva('--ok');
      const barvyPocitu = { zelena: barva('--ok'), zluta: barva('--stred'), cervena: barva('--bad') };
      nakresli('grafSila', {
        type: 'line',
        data: { datasets: [{
          label: jednotka === 'kg' ? 'Odhad síly' : 'Opakování',
          data: body.map(b => ({ x: b.den, y: b.vykon.hodnota })),
          borderColor: ok, borderWidth: 2.5, tension: 0.2, pointRadius: 4,
          pointBackgroundColor: body.map(b => barvyPocitu[b.zaznam.pocit] || ok),
          pointBorderColor: body.map(b => barvyPocitu[b.zaznam.pocit] || ok),
        }] },
        options: nastaveniGrafu(jednotka),
      });
    }

    /* ---------- splnění plánu po trénincích ---------- */

    function vykresliSplneni() {
      const podleTreninku = new Map();
      for (const z of stav.zaznamy) {
        if (!podleTreninku.has(z.trenink_id)) podleTreninku.set(z.trenink_id, []);
        podleTreninku.get(z.trenink_id).push(z);
      }
      const body = [...stav.treninky.values()]
        .sort((a, b) => a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.id - b.id)
        .map(t => ({ t, s: S.splneniTreninku(podleTreninku.get(t.id) || []) }))
        .filter(b => b.s)
        .slice(-20);
      el('splneniPrazdne').classList.toggle('hidden', body.length > 0);
      el('grafSplneniObal').classList.toggle('hidden', body.length === 0);
      if (!body.length || !root.Chart) return;

      const ok = barva('--ok'), stred = barva('--stred'), bad = barva('--bad'), muted = barva('--muted'), mrizka = barva('--border');
      const barvaSloupce = p => p >= 99.5 ? ok : p >= 90 ? stred : bad;
      const hodnoty = body.map(b => b.s.procento);
      const nastaveni = {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { filter: p => p.datasetIndex === 0, callbacks: {
            title: p => { const b = body[p[0].dataIndex]; return `Trénink ${b.t.varianta} · ${zeDne(naDen(b.t.datum))}`; },
            label: p => { const s = body[p.dataIndex].s; return `${cislo(s.procento, 0)} % · splněno ${s.splneno} z ${s.celkem} cviků`; },
          } },
        },
        scales: {
          x: { ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { display: false } },
          y: { min: Math.min(80, Math.floor(Math.min(...hodnoty) / 10) * 10), suggestedMax: 110,
               ticks: { color: muted, maxTicksLimit: 5, callback: v => v + ' %' }, grid: { color: mrizka } },
        },
      };
      nakresli('grafSplneni', {
        data: {
          labels: body.map(b => `${zeDne(naDen(b.t.datum))} ${b.t.varianta}`),
          datasets: [
            { type: 'bar', label: 'Splnění', data: hodnoty, backgroundColor: hodnoty.map(p => barvaSloupce(p) + '99'),
              borderColor: hodnoty.map(barvaSloupce), borderWidth: 1, borderRadius: 4, maxBarThickness: 28 },
            { type: 'line', label: 'Plán', data: body.map(() => 100), borderColor: muted, borderWidth: 1,
              borderDash: [4, 4], pointRadius: 0 },
          ],
        },
        options: nastaveni,
      });
    }

    /* ---------- pocity za 4 týdny ---------- */

    function vykresliPocity() {
      const od = naDen(P.posunDatum(P.mistniDatum(), -28));
      const pocty = { zelena: 0, zluta: 0, cervena: 0 };
      for (const z of stav.zaznamy) {
        const t = stav.treninky.get(z.trenink_id);
        if (t && naDen(t.datum) > od && z.pocit in pocty) pocty[z.pocit]++;
      }
      for (const k of Object.keys(pocty)) el('pocet-' + k).textContent = String(pocty[k]);
    }

    async function nacti() {
      try {
        const [vazeni, zaznamy, treninky, cviky] = await Promise.all([
          data.nactiVazeni(P.posunDatum(P.mistniDatum(), -180)), data.nactiZaznamy(5000), data.nactiTreninky(), data.nactiCviky()]);
        stav = { vazeni, zaznamy, treninky: new Map(treninky.map(t => [t.id, t])), cviky: new Map(cviky.map(c => [c.id, c.nazev])) };
        ukazChybu(root.Chart ? '' : 'Knihovna grafů se nenačetla – zkontroluj připojení a obnov stránku.');
      } catch (e) {
        ukazChybu('Nepodařilo se načíst data: ' + e.message);
      }
      vykresliVahu();
      vykresliSplneni();
      vykresliSilu();
      vykresliPocity();
    }

    // grafy se kreslí jen do viditelného panelu, jinak mají nulovou velikost
    function priZobrazeni() { nacti(); }

    // přepnutí světlého a tmavého režimu → překreslit s novými barvami
    root.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!el('panel-progres').classList.contains('hidden')) { vykresliVahu(); vykresliSplneni(); vykresliSilu(); }
    });

    return { priZobrazeni };
  }

  (root.GYM = root.GYM || {}).progres = { vytvorProgres };
})(this);
