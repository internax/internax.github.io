/* Čtení exportu docházky (.xlsx) bez knihoven: vlastní ZIP + DecompressionStream + DOMParser. */
(function (root) {
  'use strict';

  function readU16(b, o) { return b[o] | (b[o + 1] << 8); }
  function readU32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buf) {
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
      if (readU32(buf, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd === -1) throw new Error('Nepodařilo se přečíst .xlsx (chybí konec ZIP archivu).');
    const cdOffset = readU32(buf, eocd + 16);
    const cdEntries = readU16(buf, eocd + 10);
    const files = {};
    let off = cdOffset;
    for (let n = 0; n < cdEntries; n++) {
      if (readU32(buf, off) !== 0x02014b50) throw new Error('Poškozený .xlsx soubor (neplatná ZIP struktura).');
      const method = readU16(buf, off + 10);
      const compSize = readU32(buf, off + 20);
      const nameLen = readU16(buf, off + 28);
      const extraLen = readU16(buf, off + 30);
      const commentLen = readU16(buf, off + 32);
      const localOff = readU32(buf, off + 42);
      const name = new TextDecoder('utf-8').decode(buf.slice(off + 46, off + 46 + nameLen));
      const lNameLen = readU16(buf, localOff + 26);
      const lExtraLen = readU16(buf, localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const compData = buf.slice(dataStart, dataStart + compSize);
      files[name] = method === 0 ? compData : await inflateRaw(compData);
      off += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  function parseXml(text) {
    return new DOMParser().parseFromString(text, 'application/xml');
  }

  function colLetters(ref) {
    const m = /^([A-Z]+)\d+$/.exec(ref);
    return m ? m[1] : null;
  }

  /* Different exporters bind the main SpreadsheetML schema to the default
     namespace (<row>, <c>, <v>...) or to an explicit prefix (<x:row>, <x:c>,
     <x:v>...). tagName-based DOM lookups only match one or the other, so all
     traversal here goes through localName instead, which is prefix-agnostic. */
  function byLocalName(root, name) {
    const out = [];
    for (const el of root.getElementsByTagName('*')) if (el.localName === name) out.push(el);
    return out;
  }
  function firstChildByLocalName(el, name) {
    for (const c of el.children) if (c.localName === name) return c;
    return null;
  }
  function firstDescendantChildByLocalName(root, parentName, childName) {
    for (const p of byLocalName(root, parentName)) {
      const c = firstChildByLocalName(p, childName);
      if (c) return c;
    }
    return null;
  }

  /* OOXML escapes otherwise-unsafe characters in string content as _xHHHH_
     (e.g. a space becomes "_x0020_"); some exporters apply this liberally. */
  function decodeOoxmlEscapes(s) {
    if (s == null) return s;
    return s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  function getCellRaw(cellEl) {
    if (!cellEl) return null;
    const t = cellEl.getAttribute('t') || 'n';
    if (t === 'inlineStr') {
      const tEl = firstDescendantChildByLocalName(cellEl, 'is', 't');
      return tEl ? { type: 'str', value: decodeOoxmlEscapes(tEl.textContent) } : null;
    }
    const vEl = firstChildByLocalName(cellEl, 'v');
    if (!vEl || vEl.textContent === '') return null;
    return { type: t, value: decodeOoxmlEscapes(vEl.textContent) };
  }

  function resolveString(raw, sharedStrings) {
    if (!raw) return null;
    if (raw.type === 's') return sharedStrings[parseInt(raw.value, 10)] ?? null;
    return raw.value;
  }

  /* duration text like "PT7H53M0.000S" -> minutes since midnight */
  function parseDurationToMinutes(v) {
    const m = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(v);
    if (!m) return null;
    const h = parseFloat(m[1] || 0), mi = parseFloat(m[2] || 0), s = parseFloat(m[3] || 0);
    return h * 60 + mi + s / 60;
  }

  /* "HH:MM" or "-HH:MM" text -> minutes */
  function parseClockText(v) {
    const m = /^(-?)(\d+):(\d{2})$/.exec((v || '').trim());
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
  }

  /* resolve a raw cell to "minutes since midnight", trying every format this exporter is known to use */
  function toMinutesOfDay(raw, sharedStrings) {
    if (!raw) return null;
    if (raw.type === 'd') {
      if (raw.value.startsWith('P')) return parseDurationToMinutes(raw.value);
      return null; // it's actually a date, not a time
    }
    if (raw.type === 's') return parseClockText(sharedStrings[parseInt(raw.value, 10)]);
    if (raw.type === 'str' || raw.type === 'inlineStr') return parseClockText(raw.value);
    // plain numeric excel time serial (fraction of a day)
    const num = parseFloat(raw.value);
    if (!isNaN(num)) {
      const frac = num - Math.floor(num);
      return Math.round(frac * 24 * 60);
    }
    return null;
  }

  /* resolve a raw cell to an ISO date string "YYYY-MM-DD" */
  const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
  function toDateISO(raw) {
    if (!raw) return null;
    if (raw.type === 'd' && /^\d{4}-\d{2}-\d{2}/.test(raw.value)) return raw.value.slice(0, 10);
    const num = parseFloat(raw.value);
    if (!isNaN(num)) {
      const ms = EXCEL_EPOCH + Math.round(num) * 86400000;
      return new Date(ms).toISOString().slice(0, 10);
    }
    return null;
  }

  /* ---------------- workbook parsing ---------------- */

  async function parseWorkbook(arrayBuffer) {
    const files = await unzip(new Uint8Array(arrayBuffer));
    const dec = new TextDecoder('utf-8');

    // resolve first worksheet path via workbook.xml + rels (robust to different export layouts)
    let sheetPath = 'xl/worksheets/sheet1.xml';
    try {
      const wbXml = parseXml(dec.decode(files['xl/workbook.xml']));
      const firstSheet = firstDescendantChildByLocalName(wbXml, 'sheets', 'sheet');
      const rId = firstSheet && firstSheet.getAttribute('r:id');
      const relsXml = parseXml(dec.decode(files['xl/_rels/workbook.xml.rels']));
      const rel = byLocalName(relsXml, 'Relationship').find(r => r.getAttribute('Id') === rId);
      if (rel) sheetPath = 'xl/' + rel.getAttribute('Target').replace(/^\/?/, '');
    } catch (e) { /* fall back to default path */ }

    const sharedStrings = [];
    if (files['xl/sharedStrings.xml']) {
      const ssXml = parseXml(dec.decode(files['xl/sharedStrings.xml']));
      for (const si of byLocalName(ssXml, 'si')) {
        const runs = byLocalName(si, 't');
        sharedStrings.push(decodeOoxmlEscapes(runs.map(t => t.textContent).join('')));
      }
    }

    if (!files[sheetPath]) throw new Error('V souboru nenacházím list s daty (' + sheetPath + ').');
    const sheetXml = parseXml(dec.decode(files[sheetPath]));
    const rowEls = byLocalName(sheetXml, 'row');
    if (!rowEls.length) throw new Error('List je prázdný.');

    // find header row: first row containing a cell resolving to "Date"
    let headerRow = null, headerMap = {};
    for (const rowEl of rowEls.slice(0, 5)) {
      const map = {};
      for (const c of byLocalName(rowEl, 'c')) {
        const col = colLetters(c.getAttribute('r'));
        const raw = getCellRaw(c);
        const text = resolveString(raw, sharedStrings);
        if (col && text != null) map[col] = text.trim();
      }
      if (Object.values(map).some(v => v.toLowerCase() === 'date')) { headerRow = rowEl; headerMap = map; break; }
    }
    if (!headerRow) throw new Error('Nenašel jsem hlavičkový řádek se sloupcem "Date".');

    const nameToCol = {};
    for (const [col, name] of Object.entries(headerMap)) nameToCol[name] = col;
    const dateCol = nameToCol['Date'];
    const employeeCol = nameToCol['Employee'];
    if (!dateCol) throw new Error('Nenašel jsem sloupec "Date".');

    const shiftPairs = [];
    for (let n = 1; n <= 20; n++) {
      const inCol = nameToCol['In ' + n], outCol = nameToCol['Out ' + n];
      if (inCol && outCol) shiftPairs.push([inCol, outCol]);
    }
    if (!shiftPairs.length) throw new Error('Nenašel jsem žádné sloupce "In N" / "Out N".');
    const totalWageCol = nameToCol['Total Wage'];

    const headerRowNum = parseInt(headerRow.getAttribute('r'), 10);
    const rows = [];
    for (const rowEl of rowEls) {
      if (parseInt(rowEl.getAttribute('r'), 10) === headerRowNum) continue;
      const cells = {};
      for (const c of byLocalName(rowEl, 'c')) {
        const col = colLetters(c.getAttribute('r'));
        if (col) cells[col] = getCellRaw(c);
      }
      const dateISO = toDateISO(cells[dateCol]);
      if (!dateISO) continue;
      const employee = employeeCol ? resolveString(cells[employeeCol], sharedStrings) : null;

      let workedMinutes = 0, isOpen = false, hasAnyShift = false, firstInMin = null;
      for (const [inCol, outCol] of shiftPairs) {
        const inMin = toMinutesOfDay(cells[inCol], sharedStrings);
        const outMin = toMinutesOfDay(cells[outCol], sharedStrings);
        if (inMin != null) hasAnyShift = true;
        if (inMin != null && firstInMin == null) firstInMin = inMin;
        if (inMin != null && outMin != null) {
          let diff = outMin - inMin;
          if (diff < 0) diff += 24 * 60;
          workedMinutes += diff;
        } else if (inMin != null && outMin == null) {
          isOpen = true;
        }
      }

      // prefer the exporter's own "Total Wage" column (includes paid absences) for
      // finished days; a day that's still open hasn't been totalled by the exporter
      // yet, so keep the live in/out sum for that one.
      if (totalWageCol && !isOpen) {
        const twMin = toMinutesOfDay(cells[totalWageCol], sharedStrings);
        if (twMin != null) workedMinutes = twMin;
      }

      rows.push({ dateISO, employee, workedMinutes, isOpen, hasAnyShift, firstInMin });
    }
    rows.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    rows.usedTotalWage = Boolean(totalWageCol);
    return rows;
  }

  const api = { parseWorkbook, unzip, parseDurationToMinutes, parseClockText, toDateISO, decodeOoxmlEscapes };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.OC = root.OC || {}).xlsx = api;
})(this);
