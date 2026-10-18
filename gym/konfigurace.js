/* Připojení k Supabase. Adresa i publishable klíč jsou veřejné – data chrání přihlášení a Row Level Security.
   Tajný service_role / secret klíč sem nikdy nepatří. */
(function (root) {
  'use strict';
  const api = Object.freeze({
    url: 'https://lvqmehgzoemizeovroep.supabase.co',
    klic: 'sb_publishable_zalhLn1ug07iLcrMeUe3Jw_aU8xr3vX',
    // denní cíle jídla – rozhodnutí 2026-10-18 Jednoduchý kalorický tracker
    cileJidla: Object.freeze({ kcal: 3200, bilkoviny: 160, sacharidy: 440, tuky: 90 }),
  });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.GYM = root.GYM || {}).konfigurace = api;
})(this);
