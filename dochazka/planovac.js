/* Výpočet plánu měsíce: fond, odpracováno, rozdělení zbytku do dnů. Bez DOM. */
(function (root) {
  'use strict';
  const K = (typeof module === 'object' && module.exports) ? require('./kalendar.js') : root.OC.kalendar;

  const KROK_MIN = 5;
  const VOLNO = ['dovolena', 'nahradni'];

  function naplanuj({ rok, mesic0, zaznamy, nastaveni, upravy }) {
    const klic = K.monthKey(rok, mesic0);
    const norma = nastaveni.normaMin;
    const upr = upravy || {};

    const recs = new Map();
    for (const z of zaznamy || []) if (z.dateISO.slice(0, 7) === klic) recs.set(z.dateISO, z);
    const datumy = [...recs.keys()].sort();
    const hranice = datumy.length ? datumy[datumy.length - 1] : null;
    const otevreny = hranice && recs.get(hranice).isOpen ? hranice : null;

    let odpracovano = 0;
    for (const [iso, z] of recs) if (iso !== otevreny) odpracovano += z.workedMinutes;

    const dny = [];
    let pracovnichDni = 0, dovolenychDni = 0, zamceneMin = 0;
    for (const d of K.monthDays(rok, mesic0)) {
      const z = recs.get(d.iso) || null;
      const den = { iso: d.iso, dow: d.dow, druh: null, svatek: d.holiday, stav: null, hodinyMin: null,
        zamceno: false, prichodMin: null, pauza: false, odchodMin: null, rozpracovany: false };
      if (!d.isWorkday) {
        den.druh = d.isWeekend ? 'vikend' : 'svatek';
        if (z && d.iso !== otevreny) den.hodinyMin = z.workedMinutes;
      } else {
        pracovnichDni++;
        const jePlan = !hranice || d.iso > hranice || d.iso === otevreny;
        if (!jePlan) {
          den.druh = z ? 'export' : 'bezZaznamu';
          den.hodinyMin = z ? z.workedMinutes : 0;
        } else {
          const u = upr[d.iso] || {};
          den.druh = 'plan';
          den.rozpracovany = d.iso === otevreny;
          den.stav = VOLNO.includes(u.stav) ? u.stav : 'prace';
          if (den.stav === 'prace') {
            den.pauza = u.pauza !== false;
            den.prichodMin = Number.isFinite(u.prichodMin) ? u.prichodMin
              : (den.rozpracovany && z && Number.isFinite(z.firstInMin) ? z.firstInMin : nastaveni.prichodMin);
            if (Number.isFinite(u.hodinyMin) && u.hodinyMin >= 0) {
              den.zamceno = true;
              den.hodinyMin = u.hodinyMin;
              zamceneMin += u.hodinyMin;
            }
          } else {
            den.hodinyMin = 0;
            if (den.stav === 'dovolena') dovolenychDni++;
          }
        }
      }
      dny.push(den);
    }

    const fondMin = pracovnichDni * norma;
    const dovolenaMin = dovolenychDni * norma;
    const zbyvaMin = fondMin - odpracovano - dovolenaMin;
    const zbyvaAuto = zbyvaMin - zamceneMin;
    const auto = dny.filter(d => d.druh === 'plan' && d.stav === 'prace' && !d.zamceno);
    const varovani = [];

    if (zbyvaAuto <= 0) {
      auto.forEach(d => { d.hodinyMin = 0; });
    } else if (!auto.length) {
      varovani.push('Zbývají hodiny, ale není žádný den k rozplánování.');
    } else {
      const naDen = Math.ceil(zbyvaAuto / auto.length / KROK_MIN) * KROK_MIN;
      auto.forEach(d => { d.hodinyMin = naDen; });
    }

    for (const d of dny) {
      if (d.druh !== 'plan' || d.stav !== 'prace' || !(d.hodinyMin > 0)) continue;
      d.odchodMin = d.prichodMin + d.hodinyMin + (d.pauza ? nastaveni.pauzaMin : 0);
      if (d.odchodMin >= 1440) {
        varovani.push(`Odchod ${Number(d.iso.slice(8))}. ${Number(d.iso.slice(5, 7))}. vychází po půlnoci.`);
      }
    }

    const naDenMin = auto.length && zbyvaAuto > 0 ? auto[auto.length - 1].hodinyMin : null;
    return { dny, souhrn: { pracovnichDni, fondMin, odpracovanoMin: odpracovano, dovolenaMin, zbyvaMin,
      naDenMin, splneno: zbyvaMin <= 0, varovani } };
  }

  const api = { KROK_MIN, naplanuj };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.OC = root.OC || {}).planovac = api;
})(this);
