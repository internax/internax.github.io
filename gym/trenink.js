/* Záložka Trénink: výběr A/B, cviky s dnešním cílem, potvrzení barvou, přeskočení, odeslání.
   Každý potvrzený cvik se nejdřív uloží do telefonu a pak odešle; co se neodešle, zkusí se znovu. */
(function (root) {
  'use strict';
  const { progrese: PG, prumery: P, ulozeni: U, souhrn: S, data: D } = root.GYM;
  const el = id => document.getElementById(id);

  const POCIT = {
    zelena: { text: 'Pohoda', popis: 'zvládl bych 3+ navíc' },
    zluta: { text: 'Cítil jsem to', popis: '1–2 v zásobě' },
    cervena: { text: 'Na hraně', popis: 'víc by nešlo' },
  };
  const kg = x => x == null ? 'bez váhy' : x.toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) + ' kg';
  const datumCesky = iso => { const [, m, d] = iso.split('-'); return `${Number(d)}. ${Number(m)}.`; };

  function prvek(tag, trida, text) {
    const e = document.createElement(tag);
    if (trida) e.className = trida;
    if (text != null) e.textContent = text;
    return e;
  }
  // malá barevná tečka místo emoji (zelená / žlutá / červená)
  function tecka(pocit) {
    const t = prvek('span', 'tecka tecka-' + pocit);
    t.setAttribute('aria-label', POCIT[pocit].text);
    return t;
  }
  function tlacitko(text, trida, fn, popisek) {
    const b = prvek('button', trida, text);
    b.type = 'button';
    if (popisek) b.setAttribute('aria-label', popisek);
    b.addEventListener('click', fn);
    return b;
  }

  function vytvorTrenink(data, ul, poDokonceni) {
    let plan = [];                 // [{ varianta, poradi, pocet_serii, cvik }]
    let historie = {};             // cvik_id → záznamy od nejnovějšího (bez dnešního tréninku)
    let posledniVarianta = null;
    let r = ul.nactiRozpracovany();
    const koncept = {};            // cvik_id → rozpracované hodnoty karty, dokud není potvrzená
    const upravuji = new Set();    // potvrzené cviky otevřené k úpravě
    let odesilam = false;
    let chybaOdeslani = '';
    let smazanyVDb = false;        // trénink z telefonu v databázi mezitím smazali → zeptat se, ne obnovovat potichu
    let hotovo = null;             // souhrn právě dokončeného tréninku { nadpis, radky }

    const ulozR = () => ul.ulozRozpracovany(r);

    async function nacti() {
      try {
        const [p, zaznamy, posledni] = await Promise.all([data.nactiPlan(), data.nactiZaznamy(), data.nactiPosledniTrenink()]);
        plan = p;
        historie = {};
        for (const z of zaznamy) {
          if (r && z.trenink_id === r.trenink_id) continue;
          (historie[z.cvik_id] = historie[z.cvik_id] || []).push(z);
        }
        posledniVarianta = posledni ? posledni.varianta : null;
        ukazChybu('');
      } catch (e) {
        ukazChybu('Nepodařilo se načíst plán: ' + e.message);
      }
      vykresli();
      if (r && U.neodeslane(r).length) odesli();
    }

    function ukazChybu(text) {
      el('treninkChyba').textContent = text;
      el('treninkChyba').classList.toggle('hidden', !text);
    }

    /* ---------- start a konec ---------- */

    function zacni(varianta) {
      hotovo = null;
      r = { datum: P.mistniDatum(), varianta, trenink_id: null, zaznamy: {}, preskocene: [] };
      ulozR();
      vykresli();
      root.scrollTo(0, 0);
    }

    async function dokonci() {
      await odesli();
      if (smazanyVDb) return vykresli();
      if (U.neodeslane(r).length) {
        if (!chybaOdeslani) chybaOdeslani = 'Některé cviky se ještě neodeslaly – trénink zůstává v telefonu.';
        return vykresli();
      }
      hotovo = souhrnTreninku();
      ul.smazRozpracovany();
      r = null;
      Object.keys(koncept).forEach(k => delete koncept[k]);
      upravuji.clear();
      await nacti();
      if (poDokonceni) poDokonceni();
      root.scrollTo(0, 0);
    }

    // souhrn po dokončení: splnění plánu, přidaná váha, nové rekordy (historie je bez dnešního tréninku)
    function souhrnTreninku() {
      const ids = Object.keys(r.zaznamy);
      if (!ids.length) return null;
      const nazev = id => (plan.find(p => String(p.cvik.id) === id) || { cvik: { nazev: 'Cvik' } }).cvik.nazev;
      const radky = [];
      const spl = S.splneniTreninku(ids.map(id => r.zaznamy[id]));
      if (spl) radky.push(`Splněno ${spl.splneno} z ${spl.celkem} cviků · ${Math.round(spl.procento)} % plánu`);
      const pridano = ids.filter(id => S.pridanaVaha(r.zaznamy[id], (historie[id] || [])[0])).map(nazev);
      if (pridano.length) radky.push('Přidaná váha: ' + pridano.join(', '));
      const rekordy = ids.filter(id => S.jeRekord(r.zaznamy[id], historie[id] || [])).map(nazev);
      if (rekordy.length) radky.push('Nový rekord: ' + rekordy.join(', '));
      const pocet = ids.length;
      return { nadpis: `Trénink ${r.varianta} uložen – ${pocet} ${pocet === 1 ? 'cvik' : pocet < 5 ? 'cviky' : 'cviků'}. Dobrá práce!`, radky };
    }

    // zahodí rozpracovaný trénink z telefonu; co už je v databázi, zůstane
    function zahodit() {
      const ceka = U.neodeslane(r).length;
      const otazka = !Object.keys(r.zaznamy).length ? 'Zahodit trénink? Nic z něj zatím není uložené.'
        : ceka ? `Zahodit trénink? ${ceka} ${ceka === 1 ? 'neodeslaný cvik se ztratí' : 'neodeslané cviky se ztratí'}. Co už je v databázi, zůstane.`
        : 'Zahodit trénink z telefonu? Všechny cviky už jsou v databázi a zůstanou tam.';
      if (!root.confirm(otazka)) return;
      ul.smazRozpracovany();
      r = null;
      smazanyVDb = false;
      chybaOdeslani = '';
      Object.keys(koncept).forEach(k => delete koncept[k]);
      upravuji.clear();
      vykresli();
    }

    // trénink v databázi smazaný → uložit znovu jako nový
    function ulozitZnovu() {
      r.trenink_id = null;
      for (const z of Object.values(r.zaznamy)) z.odeslano = false;
      smazanyVDb = false;
      ulozR();
      vykresli();
      odesli();
    }

    /* ---------- odeslání ---------- */

    async function odesli() {
      if (odesilam || !r || smazanyVDb) return;
      odesilam = true;
      chybaOdeslani = '';
      vykresliStav();
      try {
        for (const id of U.neodeslane(r)) {
          if (r.trenink_id == null) {
            r.trenink_id = await data.zalozTrenink(r.datum, r.varianta);
            ulozR();
          }
          await data.ulozZaznam(r.trenink_id, id, r.zaznamy[id]);
          r.zaznamy[id].odeslano = true;
          ulozR();
        }
      } catch (e) {
        if (D.jeSmazanyTrenink(e)) { smazanyVDb = true; chybaOdeslani = ''; }
        else if (D.jeSitovaChyba(e)) chybaOdeslani = 'Bez spojení – cviky jsou v telefonu, odešlu je, až bude signál.';
        else chybaOdeslani = `Databáze uložení odmítla (${e.message}). Cviky zůstávají v telefonu.`;
      } finally {
        odesilam = false;
        if (smazanyVDb) vykresli(); else vykresliStav();
      }
    }

    /* ---------- akce u cviku ---------- */

    function cilPro(polozka) {
      const hist = historie[polozka.cvik.id] || [];
      return PG.dnesniCil(polozka.cvik, polozka.pocet_serii, hist[0] || null);
    }

    function konceptPro(polozka) {
      const id = String(polozka.cvik.id);
      if (!koncept[id]) {
        const ulozeny = r.zaznamy[id];
        const cil = cilPro(polozka);
        koncept[id] = ulozeny
          ? { vaha: ulozeny.vaha_kg, opakovani: [...ulozeny.opakovani], rameno: ulozeny.rameno, poznamka: ulozeny.poznamka || '' }
          : { vaha: cil.vaha_kg, opakovani: [...cil.opakovani], rameno: false, poznamka: '' };
      }
      return koncept[id];
    }

    function potvrd(polozka, pocit) {
      const id = String(polozka.cvik.id);
      const k = konceptPro(polozka);
      // cíl se uloží při prvním potvrzení; úprava cviku ho nemění
      const cil = r.zaznamy[id] && r.zaznamy[id].cil_opakovani
        ? { vaha_kg: r.zaznamy[id].cil_vaha_kg, opakovani: r.zaznamy[id].cil_opakovani }
        : cilPro(polozka);
      r.zaznamy[id] = {
        vaha_kg: k.vaha, opakovani: [...k.opakovani], pocit, rameno: k.rameno, poznamka: k.poznamka.trim(),
        cil_vaha_kg: cil.vaha_kg, cil_opakovani: [...cil.opakovani], odeslano: false,
      };
      r.preskocene = r.preskocene.filter(x => x !== id);
      delete koncept[id];
      upravuji.delete(id);
      ulozR();
      vykresli();
      odesli();
    }

    function preskoc(polozka) {
      const id = String(polozka.cvik.id);
      if (!r.preskocene.includes(id)) r.preskocene.push(id);
      ulozR();
      vykresli();
    }

    /* ---------- vykreslení ---------- */

    function vykresliStav() {
      const s = el('treninkStav');
      if (!r) { s.classList.add('hidden'); return; }
      const ceka = U.neodeslane(r).length;
      s.classList.remove('hidden', 'ok', 'warn');
      if (smazanyVDb) { s.textContent = 'Tento trénink v databázi už není.'; s.classList.add('warn'); }
      else if (odesilam) s.textContent = 'Odesílám…';
      else if (chybaOdeslani) { s.textContent = chybaOdeslani; s.classList.add('warn'); }
      else if (ceka) { s.textContent = `${ceka} ${ceka === 1 ? 'cvik čeká' : 'cviky čekají'} na odeslání.`; s.classList.add('warn'); }
      else if (Object.keys(r.zaznamy).length) { s.textContent = 'Vše uloženo ✓'; s.classList.add('ok'); }
      else s.textContent = 'Potvrď cvik barvou podle toho, jak šel.';
      el('treninkZnovu').classList.toggle('hidden', odesilam || !ceka || smazanyVDb);
    }

    function kartaSouhrn(polozka, z) {
      const karta = prvek('div', 'card cvik hotovy');
      const hlava = prvek('div', 'cvik-hlava');
      hlava.append(prvek('strong', null, polozka.cvik.nazev));
      hlava.append(tlacitko('Upravit', 'odkaz', () => { upravuji.add(String(polozka.cvik.id)); vykresli(); }));
      karta.append(hlava);
      const radek = prvek('div', 'muted');   // stav odeslání je v hlavičce
      radek.append(tecka(z.pocit), `${kg(z.vaha_kg)} · ${z.opakovani.join(' · ')}` + (z.rameno ? ' · rameno se ozvalo' : ''));
      karta.append(radek);
      return karta;
    }

    function kartaPreskocena(polozka) {
      const karta = prvek('div', 'card cvik hotovy');
      const hlava = prvek('div', 'cvik-hlava');
      hlava.append(prvek('strong', null, polozka.cvik.nazev));
      hlava.append(tlacitko('Vrátit', 'odkaz', () => {
        r.preskocene = r.preskocene.filter(x => x !== String(polozka.cvik.id));
        ulozR();
        vykresli();
      }));
      karta.append(hlava, prvek('div', 'muted', 'Přeskočeno'));
      return karta;
    }

    function kartaCviku(polozka) {
      const c = polozka.cvik;
      const k = konceptPro(polozka);
      const cil = cilPro(polozka);
      const hist = historie[c.id] || [];
      const karta = prvek('div', 'card cvik');

      const hlava = prvek('div', 'cvik-hlava');
      hlava.append(prvek('strong', null, c.nazev));
      hlava.append(prvek('span', 'muted', `${polozka.pocet_serii} × ${c.rozsah_min}–${c.rozsah_max}`));
      karta.append(hlava);
      if (c.poznamka) karta.append(prvek('div', 'muted poznamka-cviku', c.poznamka));

      const minule = hist[0];
      const info = prvek('div', 'minule');
      if (!minule) info.textContent = `Poprvé: zvol váhu, se kterou dáš ${c.rozsah_min}–${c.rozsah_max} opakování a pár ti zbyde.`;
      else {
        const duvod = { pridat: 'dnes přidej váhu', zopakovat: 'stejná váha ještě jednou', opakovani: 'zkus o opakování víc' }[cil.duvod];
        info.append(`Minule: ${kg(minule.vaha_kg)} · ${minule.opakovani.join(' · ')} `);
        if (minule.pocit) info.append(tecka(minule.pocit));
        if (duvod) info.append(prvek('span', 'duvod' + (cil.duvod === 'pridat' ? ' pridat' : ''), '→ ' + duvod));
      }
      karta.append(info);
      if (PG.dvakratCervena(hist)) {
        karta.append(prvek('div', 'upozorneni', 'Dvakrát po sobě na hraně. Dnes klidně stejná nebo nižší váha – a řekni to Claudovi.'));
      }

      // váha
      const vahaRadek = prvek('div', 'stepper');
      const vahaVstup = prvek('input', 'vaha-vstup');
      vahaVstup.type = 'text';
      vahaVstup.inputMode = 'decimal';
      vahaVstup.placeholder = 'kg';
      vahaVstup.setAttribute('aria-label', 'Váha v kg');
      vahaVstup.value = k.vaha == null ? '' : String(k.vaha).replace('.', ',');
      vahaVstup.addEventListener('input', () => {
        const v = PG.prectiVahuCviku(vahaVstup.value);
        if (v !== undefined) k.vaha = v;
      });
      vahaVstup.addEventListener('change', () => {
        const v = PG.prectiVahuCviku(vahaVstup.value);
        if (v === undefined) { vahaVstup.value = k.vaha == null ? '' : String(k.vaha).replace('.', ','); return; }
        k.vaha = v;
      });
      const posun = smer => () => { k.vaha = PG.posunVahu(k.vaha, c.krok_kg, smer); vahaVstup.value = String(k.vaha).replace('.', ','); };
      vahaRadek.append(
        tlacitko('−', 'krok', posun(-1), `Ubrat ${c.krok_kg} kg`),
        vahaVstup,
        prvek('span', 'jednotka', 'kg'),
        tlacitko('+', 'krok', posun(1), `Přidat ${c.krok_kg} kg`));
      karta.append(vahaRadek);

      // série
      const serie = prvek('div', 'serie');
      k.opakovani.forEach((o, i) => {
        const radek = prvek('div', 'serie-radek');
        const hodnota = prvek('strong', 'opakovani', String(o));
        const zmen = d => () => { k.opakovani[i] = Math.max(0, Math.min(50, k.opakovani[i] + d)); hodnota.textContent = String(k.opakovani[i]); };
        radek.append(prvek('span', 'muted', `${i + 1}. série`), tlacitko('−', 'krok', zmen(-1), 'Méně opakování'), hodnota, tlacitko('+', 'krok', zmen(1), 'Více opakování'));
        serie.append(radek);
      });
      karta.append(serie);

      // rameno a poznámka
      const doplnky = prvek('div', 'doplnky');
      const rameno = prvek('label', 'zaskrtavatko');
      const ch = prvek('input');
      ch.type = 'checkbox';
      ch.checked = k.rameno;
      ch.addEventListener('change', () => { k.rameno = ch.checked; });
      rameno.append(ch, document.createTextNode(' Rameno se ozvalo'));
      const pozn = prvek('input', 'poznamka');
      pozn.type = 'text';
      pozn.placeholder = 'Poznámka (nepovinné)';
      pozn.value = k.poznamka;
      pozn.addEventListener('input', () => { k.poznamka = pozn.value; });
      doplnky.append(rameno, pozn);
      karta.append(doplnky);

      // potvrzení barvou
      const pocity = prvek('div', 'pocity');
      for (const [klic, p] of Object.entries(POCIT)) {
        const b = tlacitko('', 'pocit pocit-' + klic, () => potvrd(polozka, klic), `${p.text} – ${p.popis}`);
        b.append(prvek('span', 'pocit-text', p.text), prvek('span', 'pocit-popis', p.popis));
        pocity.append(b);
      }
      karta.append(pocity);
      const id = String(c.id);
      karta.append(r.zaznamy[id]
        ? tlacitko('Zrušit úpravu', 'odkaz preskocit', () => { delete koncept[id]; upravuji.delete(id); vykresli(); })
        : tlacitko('Přeskočit cvik', 'odkaz preskocit', () => preskoc(polozka)));
      return karta;
    }

    function vykresliStart() {
      const na_rade = PG.dalsiVarianta(posledniVarianta);
      const obal = el('treninkObsah');
      const karta = prvek('div', 'card');
      if (hotovo) {
        const box = prvek('div', 'souhrn-treninku');
        box.append(prvek('strong', null, hotovo.nadpis));
        for (const radek of hotovo.radky) box.append(prvek('div', null, radek));
        karta.append(box);
      }
      karta.append(prvek('h2', null, `Na řadě: trénink ${na_rade}`));
      if (!plan.length) {
        karta.append(prvek('p', 'muted', 'Plán zatím není v databázi. Požádej Clauda, ať ho nahraje.'));
        obal.append(karta);
        return;
      }
      for (const v of ['A', 'B']) {
        const cviky = plan.filter(p => p.varianta === v).map(p => p.cvik.nazev);
        if (!cviky.length) continue;
        const blok = prvek('div', 'varianta');
        blok.append(tlacitko(`Začít trénink ${v}`, v === na_rade ? 'primary siroke' : 'siroke', () => zacni(v)));
        blok.append(prvek('div', 'muted', cviky.join(' · ')));
        karta.append(blok);
      }
      obal.append(karta);
    }

    function vykresli() {
      const obal = el('treninkObsah');
      obal.replaceChildren();
      el('treninkHlava').classList.toggle('hidden', !r);
      if (!r) { vykresliStav(); return vykresliStart(); }

      el('treninkNadpis').textContent = `Trénink ${r.varianta} · ${datumCesky(r.datum)}`;
      if (smazanyVDb) {
        const karta = prvek('div', 'card upozorneni-karta');
        karta.append(prvek('strong', null, 'Trénink byl v databázi mezitím smazán'));
        karta.append(prvek('p', 'muted', 'Například jako testovací. Cviky jsou pořád v telefonu – chceš ho uložit znovu, nebo zahodit?'));
        const tlacitka = prvek('div', 'radek-tlacitek');
        tlacitka.append(tlacitko('Uložit znovu', 'primary', ulozitZnovu), tlacitko('Zahodit', '', zahodit));
        karta.append(tlacitka);
        obal.append(karta);
      }
      const polozky = plan.filter(p => p.varianta === r.varianta);
      if (!polozky.length && plan.length) obal.append(prvek('p', 'muted', `Trénink ${r.varianta} nemá v plánu žádné cviky.`));
      for (const p of polozky) {
        const id = String(p.cvik.id);
        const z = r.zaznamy[id];
        if (z && !upravuji.has(id)) obal.append(kartaSouhrn(p, z));
        else if (!z && r.preskocene.includes(id)) obal.append(kartaPreskocena(p));
        else obal.append(kartaCviku(p));
      }
      const konec = prvek('div', 'akce-konec');
      konec.append(tlacitko('Dokončit trénink', 'primary siroke', dokonci));
      konec.append(tlacitko('Zahodit trénink', 'odkaz', zahodit));
      obal.append(konec);
      vykresliStav();
    }

    function spust() {
      el('treninkZnovu').addEventListener('click', odesli);
      root.addEventListener('online', odesli);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') odesli(); });
      vykresli();
    }

    return { spust, nacti };
  }

  (root.GYM = root.GYM || {}).trenink = { vytvorTrenink };
})(this);
