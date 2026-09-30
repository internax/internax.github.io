/* Ovládání stránky: přihlášení a odhlášení, záložky, spuštění obrazovek. */
(function (root) {
  'use strict';
  const el = id => document.getElementById(id);

  function chybaStranky(text) {
    el('chybaStranky').textContent = text;
    el('chybaStranky').classList.remove('hidden');
  }

  if (!root.supabase || !root.GYM) {
    chybaStranky('Nepodařilo se načíst aplikaci. Zkontroluj připojení k internetu a obnov stránku.');
    return;
  }
  const { konfigurace: KONF, ulozeni: U, data: D, dnes: DNES, trenink: TR, progres: PR, obvody: OB } = root.GYM;

  let storage = null;
  try { storage = root.localStorage; } catch (e) { storage = null; }
  const ul = U.vytvorUloziste(storage);

  const klient = root.supabase.createClient(KONF.url, KONF.klic, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gym_auth' },
  });
  const data = D.vytvorData(klient);
  const dnes = DNES.vytvorDnes(data);
  dnes.spust();
  const trenink = TR.vytvorTrenink(data, ul, () => dnes.nacti());
  trenink.spust();
  const progres = PR.vytvorProgres(data);
  const obvody = OB.vytvorObvody(data);
  obvody.spust();

  /* ---------- záložky ---------- */

  function prepniZalozku(z) {
    for (const nazev of U.ZALOZKY) {
      el('tab-' + nazev).setAttribute('aria-selected', String(nazev === z));
      el('panel-' + nazev).classList.toggle('hidden', nazev !== z);
    }
    ul.ulozZalozku(z);
    if (z === 'progres' && prihlasen) progres.priZobrazeni();     // grafy jen do viditelného panelu, vždy s čerstvými daty
  }
  for (const nazev of U.ZALOZKY) el('tab-' + nazev).addEventListener('click', () => prepniZalozku(nazev));

  /* ---------- přihlášení ---------- */

  let prihlasen = null;
  function ukazStav(session) {
    const je = Boolean(session);
    if (je === prihlasen) return;
    prihlasen = je;
    el('prihlaseni').classList.toggle('hidden', je);
    el('aplikace').classList.toggle('hidden', !je);
    el('odhlasit').classList.toggle('hidden', !je);
    if (je) {
      setTimeout(() => {
        prepniZalozku(ul.nactiZalozku());
        dnes.nacti(); trenink.nacti(); obvody.nacti();
      }, 0);    // ne přímo v onAuthStateChange – Supabase by se mohl zaseknout na zámku relace
    }
  }

  el('prihlaseniForm').addEventListener('submit', async udalost => {
    udalost.preventDefault();
    el('prihlaseniChyba').classList.add('hidden');
    el('prihlasitBtn').disabled = true;
    try {
      await data.prihlasit(el('email').value.trim(), el('heslo').value);
      el('heslo').value = '';
    } catch (e) {
      el('prihlaseniChyba').textContent = e.message;
      el('prihlaseniChyba').classList.remove('hidden');
    } finally {
      el('prihlasitBtn').disabled = false;
    }
  });
  el('odhlasit').addEventListener('click', () => data.odhlasit());

  data.priZmenePrihlaseni(session => ukazStav(session));
  data.relace().then(ukazStav, () => ukazStav(null));
})(this);
