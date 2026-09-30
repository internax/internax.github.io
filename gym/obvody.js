/* Záložka Obvody: zápis měření (pas, hrudník, paže, stehno) a tabulka se změnou od prvního měření. */
(function (root) {
  'use strict';
  const { prumery: P } = root.GYM;
  const el = id => document.getElementById(id);

  const MIRY = [['pas', 'Pas'], ['hrudnik', 'Hrudník'], ['paze', 'Paže'], ['stehno', 'Stehno']];
  const cm = x => x == null ? '–' : x.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
  const datumCesky = iso => { const [r, m, d] = iso.split('-'); return `${Number(d)}. ${Number(m)}. ${r}`; };
  // do tabulky kratší: letošní rok se vynechá
  const datumKratce = iso => { const [r, m, d] = iso.split('-'); return `${Number(d)}. ${Number(m)}.` + (Number(r) === new Date().getFullYear() ? '' : ` ${r}`); };

  function prvek(tag, trida, text) {
    const e = document.createElement(tag);
    if (trida) e.className = trida;
    if (text != null) e.textContent = text;
    return e;
  }

  function vytvorObvody(data) {
    let mereni = [];

    function ukaz(id, text) { el(id).textContent = text; el(id).classList.toggle('hidden', !text); }

    function vyplnFormular() {
      const m = mereni.find(x => x.datum === el('obvodyDatum').value);
      for (const [k] of MIRY) el('obvod-' + k).value = m && m[k] != null ? cm(m[k]) : '';
    }

    function vykresli() {
      const tabulka = el('obvodyTabulka');
      tabulka.replaceChildren();
      el('obvodyPrazdne').classList.toggle('hidden', mereni.length > 0);
      el('obvodyTabulkaObal').classList.toggle('hidden', !mereni.length);
      const prvni = {};
      for (const [k] of MIRY) prvni[k] = (mereni.find(m => m[k] != null) || {})[k] ?? null;

      [...mereni].reverse().forEach(m => {
        const tr = document.createElement('tr');
        tr.append(prvek('td', 'datum', datumKratce(m.datum)));
        for (const [k] of MIRY) {
          const td = prvek('td', null, cm(m[k]));
          if (m[k] != null && prvni[k] != null && m[k] !== prvni[k]) {
            const d = m[k] - prvni[k];
            td.append(prvek('span', 'zmena', `${d > 0 ? '+' : '−'}${cm(Math.abs(d))}`));
          }
          tr.append(td);
        }
        const smaz = prvek('button', 'odkaz', '×');
        smaz.type = 'button';
        smaz.setAttribute('aria-label', 'Smazat měření ' + datumCesky(m.datum));
        smaz.addEventListener('click', () => smazat(m.datum));
        const td = document.createElement('td');
        td.append(smaz);
        tr.append(td);
        tabulka.append(tr);
      });
      vyplnFormular();
    }

    async function nacti() {
      try {
        mereni = await data.nactiObvody();
        ukaz('obvodyChyba', '');
      } catch (e) {
        ukaz('obvodyChyba', 'Nepodařilo se načíst obvody: ' + e.message);
      }
      vykresli();
    }

    async function ulozit(udalost) {
      udalost.preventDefault();
      ukaz('obvodyStav', '');
      const hodnoty = {};
      for (const [k, nazev] of MIRY) {
        const v = P.prectiCm(el('obvod-' + k).value);
        if (v === undefined) return ukaz('obvodyChyba', `${nazev}: zadej číslo v cm, třeba 82,5.`);
        hodnoty[k] = v;
      }
      if (MIRY.every(([k]) => hodnoty[k] == null)) return ukaz('obvodyChyba', 'Vyplň aspoň jeden obvod.');
      const datum = el('obvodyDatum').value;
      if (!datum) return ukaz('obvodyChyba', 'Vyber datum.');
      el('obvodyUlozit').disabled = true;
      try {
        await data.ulozObvody(datum, hodnoty);
        ukaz('obvodyChyba', '');
        ukaz('obvodyStav', `Uloženo (${datumCesky(datum)}).`);
        await nacti();
      } catch (e) {
        ukaz('obvodyChyba', 'Uložení se nepovedlo: ' + e.message);
      } finally {
        el('obvodyUlozit').disabled = false;
      }
    }

    async function smazat(datum) {
      if (!root.confirm(`Smazat měření z ${datumCesky(datum)}?`)) return;
      try {
        await data.smazObvody(datum);
        await nacti();
      } catch (e) {
        ukaz('obvodyChyba', 'Smazání se nepovedlo: ' + e.message);
      }
    }

    function spust() {
      el('obvodyDatum').value = P.mistniDatum();
      el('obvodyDatum').max = P.mistniDatum();
      el('obvodyForm').addEventListener('submit', ulozit);
      el('obvodyDatum').addEventListener('change', vyplnFormular);
    }

    return { spust, nacti };
  }

  (root.GYM = root.GYM || {}).obvody = { vytvorObvody };
})(this);
