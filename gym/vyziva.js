/* Kalorický tracker: součty kalorií a maker za den, porce po půlkách, souhrny po dnech. Bez DOM. */
(function (root) {
  'use strict';

  const MAKRA = Object.freeze(['kcal', 'bilkoviny', 'sacharidy', 'tuky']);
  const nula = () => ({ kcal: 0, bilkoviny: 0, sacharidy: 0, tuky: 0 });
  const cislo = x => (x == null || !Number.isFinite(Number(x)) ? 0 : Number(x));

  /*
   * Hodnoty jednoho řádku dne: u potraviny z katalogu porce × hodnoty potraviny,
   * u vlastní položky porce × vlastní hodnoty. Neznámá potravina (vyřazená, nenačtená) → nuly.
   */
  function hodnotyRadku(radek, potraviny) {
    const zdroj = radek.potravina_id != null ? potraviny.get(Number(radek.potravina_id)) : radek;
    const out = nula();
    if (!zdroj) return out;
    const porce = cislo(radek.porce);
    for (const k of MAKRA) out[k] = porce * cislo(zdroj[k]);
    return out;
  }

  function soucet(radky, potraviny) {
    const out = nula();
    for (const r of radky) {
      const h = hodnotyRadku(r, potraviny);
      for (const k of MAKRA) out[k] += h[k];
    }
    return out;
  }

  // +/− půl porce, nikdy pod nulu
  function posunPorce(porce, smer) {
    return Math.max(0, Math.round((cislo(porce) + 0.5 * smer) * 2) / 2);
  }

  // součty po dnech (jen dny se záznamem), seřazené podle data
  function poDnech(radky, potraviny) {
    const dny = new Map();
    for (const r of radky) {
      if (!dny.has(r.datum)) dny.set(r.datum, []);
      dny.get(r.datum).push(r);
    }
    return [...dny.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([datum, rr]) => ({ datum, ...soucet(rr, potraviny) }));
  }

  // průměr za dny se záznamem v rozmezí [od, do] (ISO data včetně); null, když žádný není
  function prumer(dny, od, do_) {
    const v = dny.filter(d => d.datum >= od && d.datum <= do_);
    if (!v.length) return null;
    const out = nula();
    for (const d of v) for (const k of MAKRA) out[k] += d[k];
    for (const k of MAKRA) out[k] /= v.length;
    return { ...out, dnu: v.length };
  }

  // „3 200 g“ → bez desetinných, malé hodnoty s jednou desetinnou
  function cesky(x) {
    return x.toLocaleString('cs-CZ', { maximumFractionDigits: Math.abs(x) < 10 ? 1 : 0 });
  }

  const api = { MAKRA, hodnotyRadku, soucet, posunPorce, poDnech, prumer, cesky };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.GYM = root.GYM || {}).vyziva = api;
})(this);
