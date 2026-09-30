/* Paměť v telefonu (localStorage, prefix gym_): poslední záložka a rozpracovaný trénink, dokud se neodešle.
   Každý přístup je chráněný, bez úložiště vrací výchozí hodnoty. */
(function (root) {
  'use strict';

  const ZALOZKY = Object.freeze(['dnes', 'trenink', 'progres', 'obvody']);
  const KLIC_ZALOZKA = 'gym_zalozka';
  const KLIC_ROZPRACOVANY = 'gym_rozpracovany';

  const jeDatum = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const jeObjekt = v => v && typeof v === 'object' && !Array.isArray(v);

  function vytvorUloziste(storage) {
    function cti(k) { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } }
    function pis(k, v) { try { if (storage) storage.setItem(k, v); } catch (e) { /* bez paměti */ } }
    function smaz(k) { try { if (storage) storage.removeItem(k); } catch (e) { /* bez paměti */ } }

    function nactiZalozku() {
      const z = cti(KLIC_ZALOZKA);
      return ZALOZKY.includes(z) ? z : 'dnes';
    }
    function ulozZalozku(z) { if (ZALOZKY.includes(z)) pis(KLIC_ZALOZKA, z); }

    /*
     * Rozpracovaný trénink:
     * { datum, varianta, trenink_id|null,
     *   zaznamy: { [cvik_id]: { vaha_kg, opakovani: [..], pocit, rameno, poznamka, odeslano } },
     *   preskocene: [cvik_id, ..] }
     */
    function nactiRozpracovany() {
      const text = cti(KLIC_ROZPRACOVANY);
      if (text == null) return null;
      let r;
      try { r = JSON.parse(text); } catch (e) { return null; }
      if (!jeObjekt(r) || !jeDatum(r.datum) || !['A', 'B'].includes(r.varianta) || !jeObjekt(r.zaznamy)) return null;
      const zaznamy = {};
      for (const [id, z] of Object.entries(r.zaznamy)) {
        if (jeObjekt(z) && Array.isArray(z.opakovani)) zaznamy[id] = { ...z, odeslano: z.odeslano === true };
      }
      const preskocene = Array.isArray(r.preskocene) ? r.preskocene.map(String).filter(id => !(id in zaznamy)) : [];
      return { datum: r.datum, varianta: r.varianta, trenink_id: r.trenink_id ?? null, zaznamy, preskocene };
    }
    function ulozRozpracovany(r) { pis(KLIC_ROZPRACOVANY, JSON.stringify(r)); }
    function smazRozpracovany() { smaz(KLIC_ROZPRACOVANY); }

    return { nactiZalozku, ulozZalozku, nactiRozpracovany, ulozRozpracovany, smazRozpracovany, cti, pis };
  }

  // cvik_id záznamů, které ještě nejsou v databázi
  function neodeslane(rozpracovany) {
    if (!rozpracovany) return [];
    return Object.keys(rozpracovany.zaznamy).filter(id => !rozpracovany.zaznamy[id].odeslano);
  }

  const api = { ZALOZKY, vytvorUloziste, neodeslane };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.GYM = root.GYM || {}).ulozeni = api;
})(this);
