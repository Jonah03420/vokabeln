// Import-Text in Karten umwandeln. Reine Funktion, kein DOM.
// Format pro Zeile: spanisch ; deutsch ; notiz(optional)

import { normalize } from './check.js';

function splitVariants(side) {
  return side.split('/').map((v) => v.trim()).filter((v) => v !== '');
}

// Grundlage der stabilen Karten-ID. Akzente bleiben, damit año ≠ ano.
export function cardKey(es) {
  return es.map(normalize).join('/');
}

// Umkehrung von parseCards für eine Karte, z. B. zum Bearbeiten.
export function cardToLine(card) {
  const line = `${card.es.join(' / ')} ; ${card.de.join(' / ')}`;
  return card.note ? `${line} ; ${card.note}` : line;
}

export function parseCards(text) {
  const cards = [];
  const errors = [];
  const duplicates = [];
  const seen = new Set();

  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r\n|\r|\n/);

  lines.forEach((raw, index) => {
    const line = index + 1;
    const content = raw.trim();
    if (content === '' || content.startsWith('#')) return;

    const parts = content.split(';');
    if (parts.length < 2) {
      errors.push({ line, text: content, message: 'Kein Semikolon gefunden' });
      return;
    }

    const es = splitVariants(parts[0]);
    const de = splitVariants(parts[1]);
    const note = parts.slice(2).join(';').trim();

    if (es.length === 0) {
      errors.push({ line, text: content, message: 'Spanische Seite ist leer' });
      return;
    }
    if (de.length === 0) {
      errors.push({ line, text: content, message: 'Deutsche Seite ist leer' });
      return;
    }

    const key = cardKey(es);
    if (seen.has(key)) {
      duplicates.push({ line, text: content });
      return;
    }
    seen.add(key);
    cards.push({ es, de, note });
  });

  return { cards, errors, duplicates };
}
