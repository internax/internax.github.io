/* Záložka Dnes: zápis váhy, průměr a trend za posledních 7 dní, seznam posledních vážení. */
(function (root) {
  'use strict';
  const { prumery: P, souhrn: S } = root.GYM;
  const el = id => document.getElementById(id);

  const kg = x => x.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const datumCesky = iso => { const [r, m, d] = iso.split('-'); return `${Number(d)}. ${Number(m)}. ${r}`; };

  function vytvorDnes(data) {
    let vazeni = [];
    let datumyTreninku = [];

    function ukaz(id, text) { el(id).textContent = text; el(id).classList.toggle('hidden', !text); }

    function vykresli() {
      const dnes = P.mistniDatum();
      const prumery = P.klouzavyPrumer(vazeni);
      const posledni = prumery[prumery.length - 1];
      const tyden = vazeni.filter(v => v.datum > P.posunDatum(dnes, -7));
      el('statPrumer').textContent = posledni && posledni.datum > P.posunDatum(dnes, -7) ? kg(posledni.prumer) : '–';
      el('statPocet').textContent = String(tyden.length);

      const trend = P.tydenniTrend(vazeni);
      const t = el('statTrend');
      t.classList.remove('ok', 'bad');
      if (trend == null) t.textContent = '–';
      else {
        t.textContent = (trend >= 0 ? '+' : '−') + kg(Math.abs(trend));
        if (trend !== 0) t.classList.add(trend > 0 ? 'ok' : 'bad');     // nabíráme: růst = dobře
      }
      el('trendVysvetleni').textContent = trend == null
        ? 'Trend se ukáže po aspoň 3 váženích rozložených do týdne.'
        : 'Trend je změna v kg za týden z vážení za poslední 4 týdny.';

      const seznam = el('seznamVazeni');
      seznam.replaceChildren();
      [...vazeni].reverse().slice(0, 10).forEach(v => {
        const li = document.createElement('li');
        const d = document.createElement('span');
        d.className = 'datum';
        d.textContent = datumCesky(v.datum) + (v.datum === dnes ? ' · dnes' : '');
        const pravo = document.createElement('span');
        const hodnota = document.createElement('strong');
        hodnota.textContent = kg(Number(v.hmotnost_kg)) + ' kg';
        const smaz = document.createElement('button');
        smaz.type = 'button';
        smaz.className = 'odkaz';
        smaz.textContent = '×';
        smaz.setAttribute('aria-label', 'Smazat vážení ' + datumCesky(v.datum));
        smaz.addEventListener('click', () => smazat(v.datum));
        pravo.append(hodnota, smaz);
        li.append(d, pravo);
        seznam.appendChild(li);
      });
      el('zadnaVazeni').classList.toggle('hidden', vazeni.length > 0);

      // dnešní hodnota předvyplněná, ať je vidět, že je zapsáno
      const dnesni = vazeni.find(v => v.datum === el('vahaDatum').value);
      if (dnesni && document.activeElement !== el('vahaKg')) el('vahaKg').value = kg(Number(dnesni.hmotnost_kg));
    }

    // pravidelnost: posledních 8 týdnů, cíl 3 tréninky, minimum 2
    function vykresliPravidelnost() {
      const tydny = S.tydny(datumyTreninku, P.mistniDatum(), 8);
      const tento = tydny[tydny.length - 1];
      el('pravidelnostText').textContent = `Tento týden ${tento.pocet} z 3` +
        (tento.pocet >= 3 ? ' – splněno.' : tento.pocet >= 2 ? ' – minimum splněno.' : '.');
      const obal = el('pravidelnostTydny');
      obal.replaceChildren();
      tydny.forEach((t, i) => {
        const sloupec = document.createElement('div');
        sloupec.className = 'tyden' + (i === tydny.length - 1 ? ' tento' : '');
        const tecky = document.createElement('div');
        tecky.className = 'tecky';
        for (let j = 0; j < Math.max(3, t.pocet); j++) {
          const d = document.createElement('span');
          d.className = 'bod' + (j < t.pocet ? ' plny' : '') + (j >= 3 ? ' navic' : '');
          tecky.append(d);
        }
        const [, m, d] = t.od.split('-');
        const popis = document.createElement('div');
        popis.className = 'popis';
        popis.textContent = i === tydny.length - 1 ? 'teď' : `${Number(d)}. ${Number(m)}.`;
        sloupec.setAttribute('aria-label', `Týden od ${Number(d)}. ${Number(m)}.: ${t.pocet} tréninků`);
        sloupec.append(tecky, popis);
        obal.append(sloupec);
      });
    }

    async function nacti() {
      try {
        const [v, treninky] = await Promise.all([data.nactiVazeni(P.posunDatum(P.mistniDatum(), -120)), data.nactiTreninky()]);
        vazeni = v;
        datumyTreninku = treninky.map(t => t.datum);
        ukaz('vahaChyba', '');
      } catch (e) {
        ukaz('vahaChyba', 'Nepodařilo se načíst vážení: ' + e.message);
      }
      vykresli();
      vykresliPravidelnost();
    }

    async function ulozit(udalost) {
      udalost.preventDefault();
      ukaz('vahaStav', '');
      const hodnota = P.prectiKg(el('vahaKg').value);
      const datum = el('vahaDatum').value;
      if (hodnota == null) return ukaz('vahaChyba', 'Zadej váhu v kg, třeba 87,4.');
      if (!datum) return ukaz('vahaChyba', 'Vyber datum.');
      el('vahaUlozit').disabled = true;
      try {
        await data.ulozVahu(datum, hodnota);
        ukaz('vahaChyba', '');
        ukaz('vahaStav', `Uloženo: ${kg(hodnota)} kg (${datumCesky(datum)}).`);
        el('vahaKg').blur();
        await nacti();
      } catch (e) {
        ukaz('vahaChyba', 'Uložení se nepovedlo: ' + e.message);
      } finally {
        el('vahaUlozit').disabled = false;
      }
    }

    async function smazat(datum) {
      if (!root.confirm(`Smazat vážení z ${datumCesky(datum)}?`)) return;
      try {
        await data.smazVahu(datum);
        if (datum === el('vahaDatum').value) el('vahaKg').value = '';
        await nacti();
      } catch (e) {
        ukaz('vahaChyba', 'Smazání se nepovedlo: ' + e.message);
      }
    }

    function spust() {
      el('vahaDatum').value = P.mistniDatum();
      el('vahaDatum').max = P.mistniDatum();
      el('vahaForm').addEventListener('submit', ulozit);
      el('vahaDatum').addEventListener('change', () => {
        const v = vazeni.find(x => x.datum === el('vahaDatum').value);
        el('vahaKg').value = v ? kg(Number(v.hmotnost_kg)) : '';
      });
    }

    return { spust, nacti };
  }

  (root.GYM = root.GYM || {}).dnes = { vytvorDnes };
})(this);
