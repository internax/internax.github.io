/* Komunikace se Supabase: přihlášení, čtení a zápis. Bez DOM; klient se předává zvenku.
   Chyby se vyhazují jako Error s českou zprávou. */
(function (root) {
  'use strict';

  function vytvorData(klient) {
    async function uzivatelId() {
      const { data } = await klient.auth.getSession();
      if (!data.session) throw new Error('Nejsi přihlášený.');
      return data.session.user.id;
    }
    function zkontroluj({ data, error }) {
      if (error) {
        const e = new Error(error.message || 'Chyba databáze.');
        e.kod = error.code;          // kód chyby Postgresu, např. 23503
        throw e;
      }
      return data;
    }

    async function relace() {
      const { data } = await klient.auth.getSession();
      return data.session;
    }
    async function prihlasit(email, heslo) {
      const { error } = await klient.auth.signInWithPassword({ email, password: heslo });
      if (error) {
        throw new Error(/invalid login credentials/i.test(error.message) ? 'Nesprávný e-mail nebo heslo.' : error.message);
      }
    }
    async function odhlasit() { await klient.auth.signOut(); }
    function priZmenePrihlaseni(fn) { klient.auth.onAuthStateChange((_udalost, session) => fn(session)); }

    // vážení od daného data, seřazená od nejstaršího
    async function nactiVazeni(odDatum) {
      return zkontroluj(await klient.from('vazeni').select('datum, hmotnost_kg, poznamka')
        .gte('datum', odDatum).order('datum', { ascending: true }));
    }
    // 1 vážení za den: stejný den se přepíše
    async function ulozVahu(datum, hmotnost_kg) {
      const user_id = await uzivatelId();
      zkontroluj(await klient.from('vazeni').upsert({ user_id, datum, hmotnost_kg }, { onConflict: 'user_id,datum' }));
    }
    async function smazVahu(datum) {
      zkontroluj(await klient.from('vazeni').delete().eq('datum', datum));
    }

    // plán obou variant i s cviky, v pořadí
    async function nactiPlan() {
      const radky = zkontroluj(await klient.from('plan')
        .select('varianta, poradi, pocet_serii, cviky(id, nazev, rozsah_min, rozsah_max, krok_kg, poznamka)')
        .order('poradi', { ascending: true }));
      return radky.filter(r => r.cviky).map(r => ({
        varianta: r.varianta, poradi: r.poradi, pocet_serii: r.pocet_serii,
        cvik: { ...r.cviky, krok_kg: Number(r.cviky.krok_kg) },
      }));
    }
    async function nactiPosledniTrenink() {
      const radky = zkontroluj(await klient.from('treninky').select('id, datum, varianta')
        .order('datum', { ascending: false }).order('id', { ascending: false }).limit(1));
      return radky[0] || null;
    }
    // poslední záznamy od nejnovějšího (id roste s časem)
    async function nactiZaznamy(limit = 500) {
      const radky = zkontroluj(await klient.from('zaznamy')
        .select('id, trenink_id, cvik_id, vaha_kg, opakovani, pocit, rameno, cil_vaha_kg, cil_opakovani')
        .order('id', { ascending: false }).limit(limit));
      const cislo = x => x == null ? null : Number(x);
      return radky.map(r => ({ ...r, vaha_kg: cislo(r.vaha_kg), cil_vaha_kg: cislo(r.cil_vaha_kg) }));
    }
    async function zalozTrenink(datum, varianta) {
      const user_id = await uzivatelId();
      return zkontroluj(await klient.from('treninky').insert({ user_id, datum, varianta }).select('id').single()).id;
    }
    // 1 záznam = 1 cvik v tréninku; opakované uložení ho přepíše
    async function ulozZaznam(trenink_id, cvik_id, z) {
      const user_id = await uzivatelId();
      zkontroluj(await klient.from('zaznamy').upsert({
        user_id, trenink_id, cvik_id: Number(cvik_id), vaha_kg: z.vaha_kg, opakovani: z.opakovani,
        pocit: z.pocit, rameno: Boolean(z.rameno), poznamka: z.poznamka || null,
        cil_vaha_kg: z.cil_vaha_kg ?? null, cil_opakovani: z.cil_opakovani ?? null,
      }, { onConflict: 'trenink_id,cvik_id' }));
    }

    // všechny tréninky od nejstaršího
    async function nactiTreninky() {
      return zkontroluj(await klient.from('treninky').select('id, datum, varianta').order('datum', { ascending: true }));
    }
    // všechny cviky včetně vyřazených (kvůli historii)
    async function nactiCviky() {
      return zkontroluj(await klient.from('cviky').select('id, nazev, aktivni').order('id', { ascending: true }));
    }
    async function nactiObvody() {
      const radky = zkontroluj(await klient.from('obvody').select('datum, pas, hrudnik, paze, stehno, poznamka')
        .order('datum', { ascending: true }));
      const cislo = x => x == null ? null : Number(x);
      return radky.map(r => ({ ...r, pas: cislo(r.pas), hrudnik: cislo(r.hrudnik), paze: cislo(r.paze), stehno: cislo(r.stehno) }));
    }
    // 1 měření za den: stejný den se přepíše
    async function ulozObvody(datum, hodnoty) {
      const user_id = await uzivatelId();
      zkontroluj(await klient.from('obvody').upsert({ user_id, datum, ...hodnoty }, { onConflict: 'user_id,datum' }));
    }
    async function smazObvody(datum) {
      zkontroluj(await klient.from('obvody').delete().eq('datum', datum));
    }

    return {
      nactiTreninky, nactiCviky, nactiObvody, ulozObvody, smazObvody,
      relace, prihlasit, odhlasit, priZmenePrihlaseni, nactiVazeni, ulozVahu, smazVahu,
      nactiPlan, nactiPosledniTrenink, nactiZaznamy, zalozTrenink, ulozZaznam,
    };
  }

  // výpadek spojení (fetch selhal) – na rozdíl od chyby, kterou vrátila databáze
  function jeSitovaChyba(e) {
    return e instanceof TypeError || /failed to fetch|load failed|networkerror|network request failed/i.test(String(e && e.message));
  }
  // záznam odkazuje na trénink, který v databázi už není (smazaný) – porušení cizího klíče
  function jeSmazanyTrenink(e) {
    return Boolean(e) && e.kod === '23503';
  }

  const api = { vytvorData, jeSitovaChyba, jeSmazanyTrenink };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.GYM = root.GYM || {}).data = api;
})(this);
