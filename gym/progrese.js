/* Dnešní cíl cviku podle dvojité progrese a pocitu z minula; střídání tréninků A a B. Bez DOM. */
(function (root) {
  'use strict';

  const POCITY = Object.freeze(['zelena', 'zluta', 'cervena']);

  const zaokrouhli = kg => Math.round(kg * 100) / 100;          // 60 + 2.5 bez binárních drobků
  const vyplnene = (n, hodnota) => Array.from({ length: n }, () => hodnota);

  /*
   * cvik:     { rozsah_min, rozsah_max, krok_kg }
   * pocetSerii: kolik sérií je dnes v plánu
   * posledni: poslední záznam cviku { vaha_kg, opakovani: [..], pocit } nebo null
   * → { vaha_kg, opakovani: [..pocetSerii], duvod }
   *   duvod: 'bez-historie' | 'pridat' | 'zopakovat' | 'opakovani'
   */
  function dnesniCil(cvik, pocetSerii, posledni) {
    const { rozsah_min: min, rozsah_max: max, krok_kg: krok } = cvik;
    const minule = posledni && Array.isArray(posledni.opakovani) ? posledni.opakovani : [];
    if (!posledni || !minule.length) {
      return { vaha_kg: posledni ? posledni.vaha_kg ?? null : null, opakovani: vyplnene(pocetSerii, min), duvod: 'bez-historie' };
    }

    const vaha = posledni.vaha_kg ?? null;
    const vseNahore = minule.length >= pocetSerii && minule.slice(0, pocetSerii).every(o => o >= max);
    if (vseNahore && posledni.pocit !== 'cervena') {
      return { vaha_kg: vaha == null ? null : zaokrouhli(vaha + krok), opakovani: vyplnene(pocetSerii, min), duvod: 'pridat' };
    }
    if (vseNahore) return { vaha_kg: vaha, opakovani: vyplnene(pocetSerii, max), duvod: 'zopakovat' };

    // série navíc (plán se změnil) převezmou poslední známý výkon
    const opakovani = vyplnene(pocetSerii, 0).map((_, i) => {
      const o = minule[i] ?? minule[minule.length - 1];
      return Math.min(max, Math.max(min, o + 1));
    });
    return { vaha_kg: vaha, opakovani, duvod: 'opakovani' };
  }

  // záznamy jednoho cviku od nejnovějšího: poslední dva červené → upozornit
  function dvakratCervena(zaznamy) {
    return zaznamy.length >= 2 && zaznamy[0].pocit === 'cervena' && zaznamy[1].pocit === 'cervena';
  }

  // váha u cviku: „22,5“ i „22.5“; prázdné = bez váhy (vlastní váha těla); nesmysl nebo mimo 0–500 → undefined
  function prectiVahuCviku(text) {
    const s = String(text ?? '').trim().replace(',', '.');
    if (s === '') return null;
    if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
    const kg = zaokrouhli(Number(s));
    return kg <= 500 ? kg : undefined;
  }
  // +/− o krok, nikdy pod nulu
  function posunVahu(vaha, krok, smer) {
    return Math.max(0, zaokrouhli((vaha ?? 0) + smer * krok));
  }

  /*
   * Výkon jednoho záznamu jako jedno číslo pro graf síly:
   * s váhou = odhad maxima na 1 opakování z nejlepší série (Epley: váha × (1 + opakování / 30)),
   * bez váhy (vlastní váha těla) = součet opakování. → { hodnota, jednotka: 'kg' | 'opak' } nebo null
   */
  function vykon(zaznam) {
    const opak = (zaznam && Array.isArray(zaznam.opakovani) ? zaznam.opakovani : []).filter(o => o > 0);
    if (!opak.length) return null;
    const vaha = zaznam.vaha_kg == null ? 0 : Number(zaznam.vaha_kg);
    if (vaha <= 0) return { hodnota: opak.reduce((a, o) => a + o, 0), jednotka: 'opak' };
    return { hodnota: zaokrouhli(vaha * (1 + Math.max(...opak) / 30)), jednotka: 'kg' };
  }
  // změna výkonu v % mezi prvním a posledním záznamem (od nejstaršího); null, když není s čím srovnat
  function zmenaVykonu(zaznamyOdNejstarsiho) {
    const v = zaznamyOdNejstarsiho.map(vykon).filter(Boolean);
    if (v.length < 2 || v[0].jednotka !== v[v.length - 1].jednotka || v[0].hodnota === 0) return null;
    return (v[v.length - 1].hodnota / v[0].hodnota - 1) * 100;
  }

  function dalsiVarianta(posledniVarianta) {
    return posledniVarianta === 'A' ? 'B' : 'A';
  }

  const api = { POCITY, dnesniCil, dvakratCervena, dalsiVarianta, prectiVahuCviku, posunVahu, vykon, zmenaVykonu };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.GYM = root.GYM || {}).progrese = api;
})(this);
