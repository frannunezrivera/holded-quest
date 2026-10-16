/**
 * Bank statement descriptions are long and noisy ("************1234 MERCADONA PARQUE AZALEA( MALAGA
 * ES PAGO CON TARJETA EN SUPERMERCADOS"). These helpers turn them into short, readable names.
 */

// Bank boilerplate: card/transfer/direct-debit categories and everything that follows them.
const BOILERPLATE = [
  /\bPAGO CON TARJETA\b.*$/i,
  /\bCOMPRA (?:CON )?TARJ(?:ETA)?\b.*$/i,
  /\bADEUDO (?:A SU CARGO|DE [A-ZÁÉÍÓÚÑ /]+|RECIBO|SEPA)\b.*$/i,
  /\bADEUDO\b.*$/i,
  /\bCOMPRA EN COMERCIO\b.*$/i,
  /\bCARGO POR\b/gi,
  /\bLIQ\.?\s*OP\.?(?=\s|$)/gi,
  /\bRECIBO\b/gi,
  /\bTRANSFERENCIAS?(?: (?:A FAVOR DE|EMITIDAS?|RECIBIDAS?|INMEDIATAS?|SEPA))?\b/gi,
  /\bTRANSF\.?\b/gi,
  /\bBIZUM (?:ENVIADO|RECIBIDO)(?: A| DE)?\b/gi,
  /\b(?:ABONO|CARGO|LIQUIDACI[OÓ]N|DEVOLUCI[OÓ]N)(?: DE)?\b/gi,
];

// Recognisable Spanish bank lines get a short, fixed name.
const SPECIAL: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/\bN[OÓ]MINAS?\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\b/i, (m) => `Nómina ${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()}`],
  [/\bPAGO DE N[OÓ]MINAS?\b/i, () => 'Nóminas'],
  [/\bPAGO DE IMPUESTOS\b/i, () => 'Pago de impuestos'],
  [/\bCOTIZACI[OÓ]N\b.*AUT[OÓ]NOMOS|\bCUOTA DE LA SEGURIDAD SOCIAL\b/i, () => 'Cuota de autónomos'],
  [/\bINV\/(F[\w-]+)/i, (m) => `Factura ${m[1].toUpperCase()}`],
];

// Legal forms add length without meaning in a game label.
// Longest forms first, so "S.a.r.l." isn't eaten as "S.a" + "r.l.".
const LEGAL = /(?:^|\s)(?:S\.?\s?A\.?\s?R\.?\s?L\.?|S\.?\s?C\.?\s?A\.?|S\.?\s?COOP\.?|S\.?\s?L\.?\s?U\.?|S\.?\s?A\.?\s?U\.?|S\.?\s?L\.?|S\.?\s?A\.?|ET CIE|GMBH|LTD\.?|LIMITED|INC\.?|B\.?V\.?|LLC|SAS)(?=\s|$|[,])/gi;

// Short words that should stay in capitals after title-casing.
const ACRONYMS = new Set(['AEAT', 'BBVA', 'TGSS', 'IVA', 'IRPF', 'SEPA', 'IBAN', 'ING', 'AXA', 'BMW', 'DGT', 'ONCE', 'SL', 'SA', 'UK', 'EU', 'USA']);

function titleCase(s: string): string {
  return s
    .split(' ')
    .map((w) => {
      const bare = w.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '').toUpperCase();
      if (ACRONYMS.has(bare) || /\d/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Drops a repeated name: "GORILA DIGITAL TRANSFERENCIAS GORILA DIGITAL" → "GORILA DIGITAL". */
function dedupe(words: string[]): string[] {
  const norm = words.map((w) => w.toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, ''));
  for (let k = Math.floor(words.length / 2); k >= 1; k--) {
    for (let i = k; i + k <= words.length; i++) {
      let same = true;
      for (let j = 0; j < k; j++) if (norm[j] !== norm[i + j] || !norm[j]) same = false;
      if (same && (k >= 2 || norm[0].length >= 4)) return words.slice(0, i);
    }
  }
  return words;
}

/** Cuts to `max` characters at a word boundary, adding an ellipsis. */
export function short(s: string, max = 24): string {
  const clean = s.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s.,;:(·-]+$/, '') + '…';
}

export function cleanLabel(raw: string | null | undefined, max = 26): string {
  let s = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  for (const [re, name] of SPECIAL) {
    const m = s.match(re);
    if (m) return short(name(m), max);
  }
  const original = s;
  s = s
    .replace(/[*xX]{4,}\d{0,4}/g, ' ') // masked card numbers
    .replace(/^\d{3,4}\s+/, '') // card terminals start with the card's last digits
    .replace(/\bLINK\.COM\b/gi, ' ') // payment-processor prefixes
    .replace(/\*/g, ' ')
    .replace(/\b[A-Z]{2}\d{2}(?:\s?\d{4}){3,7}(?:\s?\d{1,4})?\b/g, ' ') // IBANs (digit groups only, so words survive)
    .replace(/\bN[OÓº°]?\.?\s*\d{4,}\b/gi, ' ') // "N 1234567890" / "NO 1234" references
    .replace(/\bNRC\.?\s*\S+/gi, ' ') // tax payment codes
    .replace(/\b(?:REF|REFERENCIA|ORDENANTE|BENEFICIARIO|CONCEPTO)\b[:.]?/gi, ' ')
    .replace(/\b\d{5,}\b/g, ' ') // long numbers
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' '); // dates
  for (const re of BOILERPLATE) s = s.replace(re, ' ');
  s = s.replace(/\(.*$/, ' '); // card terminals append "(CITY COUNTRY" after the shop name
  s = s.replace(LEGAL, ' ');
  s = s.replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[\s.,;:/-]+|[\s.,;:/-]+$/g, '');
  let words = s.split(' ').filter(Boolean);
  words = dedupe(words);
  // A trailing two-letter country code from card terminals ("MALAGA ES").
  if (words.length > 2 && /^(?:ES|PT|FR|IE|LU|NL|DE|GB|US)$/i.test(words[words.length - 1])) words.pop();
  // Dangling connectors and single letters left behind by the removals.
  while (words.length > 1 && /^(?:POR|A|SU|DE|DEL|LA|EL|EN|Y|CON|NO|NUM|[A-Z])$/i.test(words[words.length - 1])) words.pop();
  s = words.join(' ');
  if (!s) s = original;
  const letters = s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '').length;
  if (letters.length && upper / letters.length > 0.6) s = titleCase(s);
  return short(s, max);
}
