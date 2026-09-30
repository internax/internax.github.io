/* Klouzavý průměr váhy z dostupných vážení a týdenní trend. Chybějící dny nevadí. Bez DOM. */
(function (root) {
  'use strict';

  const DEN_MS = 86400000;
  const naDen = datumISO => Math.round(Date.parse(datumISO + 'T00:00:00Z') / DEN_MS);   // počet dní od 1970, bez časových pásem

  function seradit(vazeni) {
    return vazeni
      .filter(v => v && typeof v.datum === 'string' && Number.isFinite(Number(v.hmotnost_kg)))
      .map(v => ({ datum: v.datum, hmotnost_kg: Number(v.hmotnost_kg), den: naDen(v.datum) }))
      .filter(v => Number.isFinite(v.den))
      .sort((a, b) => a.den - b.den);
  }

  /*
   * Pro každé vážení průměr všech vážení za posledních `dny` dní včetně toho dne.
   * → [{ datum, hmotnost_kg, prumer, pocet }] seřazené podle data
   */
  function klouzavyPrumer(vazeni, dny = 7) {
    const s = seradit(vazeni);
    return s.map(v => {
      const okno = s.filter(w => w.den <= v.den && w.den > v.den - dny);
      const prumer = okno.reduce((a, w) => a + w.hmotnost_kg, 0) / okno.length;
      return { datum: v.datum, hmotnost_kg: v.hmotnost_kg, prumer, pocet: okno.length };
    });
  }

  /*
   * Změna váhy v kg za týden: sklon přímky proložené váženími za posledních `okno` dní.
   * null, když jsou méně než 3 vážení nebo pokrývají méně než týden.
   */
  function tydenniTrend(vazeni, okno = 28) {
    const s = seradit(vazeni);
    if (!s.length) return null;
    const konec = s[s.length - 1].den;
    const v = s.filter(w => w.den > konec - okno);
    if (v.length < 3 || konec - v[0].den < 7) return null;

    const mx = v.reduce((a, w) => a + w.den, 0) / v.length;
    const my = v.reduce((a, w) => a + w.hmotnost_kg, 0) / v.length;
    const cit = v.reduce((a, w) => a + (w.den - mx) * (w.hmotnost_kg - my), 0);
    const jm = v.reduce((a, w) => a + (w.den - mx) ** 2, 0);
    return (cit / jm) * 7;
  }

  // dnešní datum podle hodin v telefonu (ne UTC – kolem půlnoci by jinak skočilo o den)
  function mistniDatum(d = new Date()) {
    const dva = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dva(d.getMonth() + 1)}-${dva(d.getDate())}`;
  }
  function posunDatum(datumISO, dny) {
    return new Date((naDen(datumISO) + dny) * DEN_MS).toISOString().slice(0, 10);
  }
  // „87,4“ i „87.4“ → 87.4; mimo rozsah 30–250 kg nebo nesmysl → null
  function prectiKg(text) {
    const s = String(text ?? '').trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const kg = Math.round(Number(s) * 100) / 100;
    return kg >= 30 && kg <= 250 ? kg : null;
  }

  // obvod v cm: „82,5“ i „82.5“; prázdné = neměřeno (null); nesmysl nebo mimo 10–250 cm → undefined
  function prectiCm(text) {
    const s = String(text ?? '').trim().replace(',', '.');
    if (s === '') return null;
    if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
    const cm = Math.round(Number(s) * 10) / 10;
    return cm >= 10 && cm <= 250 ? cm : undefined;
  }

  const api = { klouzavyPrumer, tydenniTrend, mistniDatum, posunDatum, prectiKg, prectiCm };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.GYM = root.GYM || {}).prumery = api;
})(this);
