/* Nastavení a plány v localStorage (prefix oc_). Každý přístup je chráněný, bez úložiště vrací výchozí hodnoty. */
(function (root) {
  'use strict';

  const VYCHOZI = Object.freeze({ normaMin: 384, prichodMin: 450, pauzaMin: 40,
    cestaTamZap: true, cestaTamMin: 30, cestaZpetZap: true, cestaZpetMin: 30 });
  const KLIC_NASTAVENI = 'oc_nastaveni';
  const klicPlanu = mesic => 'oc_plan_' + mesic;

  function vytvorUloziste(storage) {
    function cti(k) { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } }
    function pis(k, v) { try { if (storage) storage.setItem(k, v); } catch (e) { /* bez paměti */ } }
    function smaz(k) { try { if (storage) storage.removeItem(k); } catch (e) { /* bez paměti */ } }
    function ctiObjekt(k) {
      const text = cti(k);
      if (text == null) return null;
      try {
        const v = JSON.parse(text);
        return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
      } catch (e) { return null; }
    }

    function migrace() {
      if (cti(KLIC_NASTAVENI) == null) {
        const h = cti('oc_target_h'), m = cti('oc_target_m');
        if (h != null || m != null) {
          const normaMin = (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
          pis(KLIC_NASTAVENI, JSON.stringify({ ...VYCHOZI, normaMin }));
        }
      }
      smaz('oc_target_h');
      smaz('oc_target_m');
      try {
        if (!storage) return;
        const stare = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k && k.startsWith('oc_jewish_')) stare.push(k);
        }
        stare.forEach(smaz);
      } catch (e) { /* bez paměti */ }
    }

    function nactiNastaveni() {
      const ulozene = ctiObjekt(KLIC_NASTAVENI) || {};
      const out = { ...VYCHOZI };
      for (const k of Object.keys(VYCHOZI)) {
        const v = ulozene[k];
        if (typeof v !== typeof VYCHOZI[k]) continue;
        if (typeof v === 'number' && !(Number.isFinite(v) && v >= 0)) continue;
        out[k] = v;
      }
      return out;
    }
    function ulozNastaveni(n) { pis(KLIC_NASTAVENI, JSON.stringify(n)); }
    function nactiPlan(mesic) { return ctiObjekt(klicPlanu(mesic)) || {}; }
    function ulozPlan(mesic, upravy) {
      if (Object.keys(upravy).length) pis(klicPlanu(mesic), JSON.stringify(upravy));
      else smaz(klicPlanu(mesic));
    }
    function smazPlan(mesic) { smaz(klicPlanu(mesic)); }

    return { migrace, nactiNastaveni, ulozNastaveni, nactiPlan, ulozPlan, smazPlan, cti, pis };
  }

  const api = { VYCHOZI, vytvorUloziste };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.OC = root.OC || {}).ulozeni = api;
})(this);
