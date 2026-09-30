/* Souhrny nad záznamy: splnění plánu (cviku i tréninku), osobní rekordy, tréninky po týdnech. Bez DOM. */
(function (root) {
  'use strict';
  const PG = typeof module === 'object' && module.exports ? require('./progrese.js') : root.GYM.progrese;

  const DEN_MS = 86400000;
  const naDen = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / DEN_MS);
  const zeDne = den => new Date(den * DEN_MS).toISOString().slice(0, 10);
  const soucet = pole => pole.reduce((a, x) => a + (x > 0 ? x : 0), 0);

  // objem = váha × opakování; bez váhy (vlastní váha těla) jen opakování
  function objem(vaha_kg, opakovani) {
    const v = vaha_kg == null ? 0 : Number(vaha_kg);
    return v > 0 ? v * soucet(opakovani) : soucet(opakovani);
  }

  /*
   * Splnění cíle u jednoho záznamu. Cíl (cil_vaha_kg, cil_opakovani) se ukládá při potvrzení cviku.
   * Bez cílové váhy (první trénink cviku) se srovnávají jen opakování při skutečné váze.
   * → { pomer: odjetý objem / objem v cíli, splneno: váha i všechna opakování aspoň podle cíle } nebo null
   */
  function splneniCviku(z) {
    if (!z || !Array.isArray(z.cil_opakovani) || !z.cil_opakovani.length || !Array.isArray(z.opakovani)) return null;
    const cilVaha = z.cil_vaha_kg == null ? z.vaha_kg : z.cil_vaha_kg;
    const planovano = objem(cilVaha, z.cil_opakovani);
    if (!(planovano > 0)) return null;
    const vahaOk = cilVaha == null || Number(z.vaha_kg ?? 0) >= Number(cilVaha);
    const opakOk = z.cil_opakovani.every((c, i) => (z.opakovani[i] ?? 0) >= c);
    return { pomer: objem(z.vaha_kg, z.opakovani) / planovano, splneno: vahaOk && opakOk };
  }

  // splnění celého tréninku: průměr poměrů cviků (každý cvik váží stejně, leg press nepřebije biceps)
  function splneniTreninku(zaznamy) {
    const s = zaznamy.map(splneniCviku).filter(Boolean);
    if (!s.length) return null;
    return {
      procento: s.reduce((a, x) => a + x.pomer, 0) / s.length * 100,
      splneno: s.filter(x => x.splneno).length,
      celkem: s.length,
    };
  }

  // nový osobní rekord = výkon (odhad síly) vyšší než všechny předchozí záznamy cviku; první záznam není rekord
  function jeRekord(zaznam, predchozi) {
    const v = PG.vykon(zaznam);
    const dosud = predchozi.map(PG.vykon).filter(x => x && v && x.jednotka === v.jednotka);
    return Boolean(v) && dosud.length > 0 && v.hodnota > Math.max(...dosud.map(x => x.hodnota));
  }

  // přidaná váha oproti poslednímu předchozímu záznamu cviku
  function pridanaVaha(zaznam, posledni) {
    return Boolean(posledni) && posledni.vaha_kg != null && zaznam.vaha_kg != null && Number(zaznam.vaha_kg) > Number(posledni.vaha_kg);
  }

  /*
   * Počet tréninků v posledních `pocet` týdnech (pondělí–neděle), od nejstaršího.
   * → [{ od: 'YYYY-MM-DD' (pondělí), pocet }]
   */
  function tydny(datumyTreninku, dnesISO, pocet = 8) {
    const dnes = naDen(dnesISO);
    const pondeli = dnes - ((new Date(dnes * DEN_MS).getUTCDay() + 6) % 7);
    const vsechny = datumyTreninku.map(naDen);
    const vysledek = [];
    for (let i = pocet - 1; i >= 0; i--) {
      const od = pondeli - 7 * i;
      const vTydnu = vsechny.filter(d => d >= od && d < od + 7);
      vysledek.push({ od: zeDne(od), pocet: vTydnu.length, dnu: new Set(vTydnu).size });
    }
    return vysledek;
  }

  const api = { objem, splneniCviku, splneniTreninku, jeRekord, pridanaVaha, tydny };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.GYM = root.GYM || {}).souhrn = api;
})(this);
