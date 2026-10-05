/* Export plánu do iCalendar (.ics, RFC 5545). Časy v UTC. Bez DOM. */
(function (root) {
  'use strict';
  const K = (typeof module === 'object' && module.exports) ? require('./kalendar.js') : root.OC.kalendar;

  function formatUtc(date) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  // místní čas prohlížeče (den + minuty od půlnoci) -> UTC ve formátu 20261023T053000Z
  function utc(iso, minuty) {
    const [y, m, d] = iso.split('-').map(Number);
    return formatUtc(new Date(y, m - 1, d, 0, minuty));
  }
  function escapeText(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function slozRadek(radek) {
    const enc = new TextEncoder();
    const out = [];
    let cur = '', curLen = 0;
    for (const ch of radek) {
      const len = enc.encode(ch).length;
      if (curLen + len > 75) { out.push(cur); cur = ' '; curLen = 1; }
      cur += ch; curLen += len;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function udalost(uid, zacatek, konec, nazev, popis, dtstamp) {
    const r = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dtstamp}`, `DTSTART:${zacatek}`, `DTEND:${konec}`,
      `SUMMARY:${escapeText(nazev)}`];
    if (popis) r.push(`DESCRIPTION:${escapeText(popis)}`);
    r.push('END:VEVENT');
    return r;
  }

  function vytvorIcs(dny, nastaveni, ted) {
    const dtstamp = formatUtc(ted || new Date());
    const radky = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//marektatyrek.cz//Dochazka planovac//CS',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const d of dny) {
      if (d.druh !== 'plan' || d.stav !== 'prace' || !(d.hodinyMin > 0)) continue;
      const uid = typ => `oc-${d.iso}-${typ}@marektatyrek.cz`;
      if (nastaveni.cestaTamZap) {
        radky.push(...udalost(uid('cesta-tam'), utc(d.iso, d.prichodMin - nastaveni.cestaTamMin), utc(d.iso, d.prichodMin),
          'Cesta do práce', '', dtstamp));
      }
      radky.push(...udalost(uid('prace'), utc(d.iso, d.prichodMin), utc(d.iso, d.odchodMin),
        `Práce ${K.fmtClock(d.hodinyMin)}`, d.pauza ? `pauza ${nastaveni.pauzaMin} min` : '', dtstamp));
      if (d.gym) {
        // gym nahrazuje cestu z práce: cesta do gymu → gym → cesta z gymu, události s nulovou délkou se vynechají
        let cas = d.odchodMin;
        for (const [typ, nazev, delka] of [['gym-tam', 'Cesta do gymu', nastaveni.cestaGymTamMin],
          ['gym', 'Gym', nastaveni.gymMin], ['gym-zpet', 'Cesta z gymu', nastaveni.cestaGymZpetMin]]) {
          if (delka > 0) radky.push(...udalost(uid(typ), utc(d.iso, cas), utc(d.iso, cas + delka), nazev, '', dtstamp));
          cas += delka;
        }
      } else if (nastaveni.cestaZpetZap) {
        radky.push(...udalost(uid('cesta-zpet'), utc(d.iso, d.odchodMin), utc(d.iso, d.odchodMin + nastaveni.cestaZpetMin),
          'Cesta z práce', '', dtstamp));
      }
    }
    radky.push('END:VCALENDAR');
    return radky.map(slozRadek).join('\r\n') + '\r\n';
  }

  function nazevSouboru(rok, mesic0) { return `plan-${K.monthKey(rok, mesic0)}.ics`; }

  const api = { vytvorIcs, slozRadek, nazevSouboru };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.OC = root.OC || {}).ics = api;
})(this);
