// Antwortprüfung. Reine Funktionen, kein DOM.

const EDGE_PUNCTUATION = /^[\s¿¡?!.,;:]+|[\s¿¡?!.,;:]+$/gu;

// Kleinschreibung, Leerzeichen zusammengefasst, Satzzeichen am Rand entfernt.
// Akzente bleiben erhalten. Typografische Apostrophe (z. B. vom Handy) zählen wie '.
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[’‘ʼ`´]/gu, "'")
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .replace(EDGE_PUNCTUATION, '');
}

// á → a, ñ → n, ü → u (NFD zerlegt, kombinierende Zeichen entfernt).
export function stripAccents(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

// variants: Liste der richtigen Antworten (die mit / getrennten Varianten).
export function checkAnswer(input, variants) {
  const answer = normalize(input);
  if (answer === '' || variants.length === 0) {
    return { result: 'falsch', expected: variants[0] ?? '' };
  }

  const exact = variants.find((v) => normalize(v) === answer);
  if (exact !== undefined) return { result: 'richtig', expected: exact };

  const plain = stripAccents(answer);
  const almost = variants.find((v) => stripAccents(normalize(v)) === plain);
  if (almost !== undefined) return { result: 'fast richtig', expected: almost };

  return { result: 'falsch', expected: variants[0] };
}
