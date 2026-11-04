// Stapel verwalten und mitgelieferte Kapitel laden. Kein DOM.
// Die Funktionen ändern das übergebene Datenobjekt; speichern muss der Aufrufer.

import { cardKey, parseCards } from './parser.js';
import { cardId } from './storage.js';

export const BUILTIN_PREFIX = 'datei:';

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function newDeckId(data) {
  let id;
  do {
    id = `eigen-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  } while (data.decks.some((d) => d.id === id));
  return id;
}

export function findDeck(data, id) {
  return data.decks.find((d) => d.id === id) ?? null;
}

export function createDeck(data, name) {
  const clean = String(name ?? '').trim();
  if (clean === '') return { ok: false, error: 'Bitte einen Namen eingeben.' };
  const deck = { id: newDeckId(data), name: clean, cards: [] };
  data.decks.push(deck);
  return { ok: true, deck };
}

export function renameDeck(data, id, name) {
  const deck = findDeck(data, id);
  const clean = String(name ?? '').trim();
  if (!deck) return { ok: false, error: 'Stapel nicht gefunden.' };
  if (clean === '') return { ok: false, error: 'Bitte einen Namen eingeben.' };
  deck.name = clean;
  return { ok: true };
}

function removeProgress(data, deckId, es) {
  delete data.progress[cardId(deckId, es)];
}

export function deleteDeck(data, id) {
  const deck = findDeck(data, id);
  if (!deck) return false;
  deck.cards.forEach((card) => removeProgress(data, id, card.es));
  data.decks = data.decks.filter((d) => d !== deck);
  return true;
}

// Teilt neue Karten in solche, die es im Stapel noch nicht gibt, und vorhandene.
export function splitNew(deck, cards) {
  const keys = new Set(deck.cards.map((c) => cardKey(c.es)));
  const fresh = [];
  const existing = [];
  for (const card of cards) (keys.has(cardKey(card.es)) ? existing : fresh).push(card);
  return { fresh, existing };
}

export function addCards(deck, cards) {
  const { fresh } = splitNew(deck, cards);
  deck.cards.push(...fresh);
  return fresh.length;
}

// line im Einfügeformat: spanisch ; deutsch ; notiz
export function updateCard(data, deckId, index, line) {
  const deck = findDeck(data, deckId);
  const old = deck?.cards[index];
  if (!old) return { ok: false, error: 'Karte nicht gefunden.' };

  const { cards, errors } = parseCards(line);
  if (errors.length > 0) return { ok: false, error: errors[0].message };
  if (cards.length !== 1) {
    return { ok: false, error: 'Bitte genau eine Karte im Format „spanisch ; deutsch ; notiz“ eingeben.' };
  }
  const card = cards[0];
  const others = deck.cards.filter((c) => c !== old);
  if (others.some((c) => cardKey(c.es) === cardKey(card.es))) {
    return { ok: false, error: 'Diese Karte gibt es im Stapel schon.' };
  }

  // Fortschritt mitnehmen, falls sich die spanische Seite und damit die ID ändert.
  const oldId = cardId(deckId, old.es);
  const newId = cardId(deckId, card.es);
  if (oldId !== newId && data.progress[oldId]) {
    data.progress[newId] = data.progress[oldId];
    delete data.progress[oldId];
  }
  deck.cards[index] = card;
  return { ok: true };
}

export function deleteCard(data, deckId, index) {
  const deck = findDeck(data, deckId);
  const card = deck?.cards[index];
  if (!card) return false;
  removeProgress(data, deckId, card.es);
  deck.cards.splice(index, 1);
  return true;
}

export function recordResult(data, id, correct) {
  const entry = data.progress[id] ?? { correct: 0, wrong: 0 };
  if (correct) entry.correct += 1;
  else entry.wrong += 1;
  data.progress[id] = entry;
}

// Vorschau-Text, z. B. „23 Karten erkannt, 1 Fehler in Zeile 7“.
export function importSummary({ cards, errors, duplicates }, existingCount = 0) {
  const parts = [`${plural(cards.length, 'Karte', 'Karten')} erkannt`];
  if (existingCount > 0) parts.push(`${existingCount} schon im Stapel`);
  if (duplicates.length > 0) parts.push(`${duplicates.length} doppelt`);
  if (errors.length > 0) {
    const lines = errors.map((e) => e.line).join(', ');
    parts.push(`${errors.length} Fehler in ${errors.length === 1 ? 'Zeile' : 'Zeilen'} ${lines}`);
  }
  return parts.join(', ');
}

async function fetchText(fetchFn, url) {
  const response = await fetchFn(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

// Lädt decks/index.json und alle Kapitel. Wirft nie; Probleme kommen als Texte zurück.
export async function loadBuiltinDecks(fetchFn, base = 'decks/') {
  let list;
  try {
    list = JSON.parse(await fetchText(fetchFn, `${base}index.json`));
  } catch {
    return { decks: [], problems: ['Die Kapitelliste (decks/index.json) konnte nicht geladen werden.'] };
  }
  if (!Array.isArray(list)) {
    return { decks: [], problems: ['Die Kapitelliste (decks/index.json) hat ein ungültiges Format.'] };
  }

  const results = await Promise.all(list.map(async (entry, i) => {
    const file = typeof entry?.file === 'string' ? entry.file.trim() : '';
    if (file === '') return { problem: `Eintrag ${i + 1} in decks/index.json hat keine Datei.` };
    const name = typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name.trim() : file;
    try {
      const { cards, errors } = parseCards(await fetchText(fetchFn, base + file));
      const problem = errors.length > 0
        ? `„${name}“: ${plural(errors.length, 'fehlerhafte Zeile', 'fehlerhafte Zeilen')} übersprungen (${errors.map((e) => `Zeile ${e.line}`).join(', ')}).`
        : null;
      return { deck: { id: BUILTIN_PREFIX + file, name, file, cards, builtin: true }, problem };
    } catch {
      return { problem: `„${name}“ (decks/${file}) konnte nicht geladen werden.` };
    }
  }));

  const decks = [];
  const problems = [];
  for (const { deck, problem } of results) {
    if (problem) problems.push(problem);
    if (!deck) continue;
    if (decks.some((d) => d.id === deck.id)) problems.push(`decks/${deck.file} steht doppelt in der Kapitelliste.`);
    else decks.push(deck);
  }
  return { decks, problems };
}
