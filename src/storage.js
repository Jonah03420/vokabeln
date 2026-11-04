// Laden, Speichern, Export, Import, Validierung. Kein DOM.
// Der Speicher wird übergeben (Standard: localStorage), damit alles in Node testbar ist.

import { cardKey } from './parser.js';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'vokabeln';
export const BACKUP_KEY = 'vokabeln-kaputt';

const DIRECTIONS = ['de-es', 'es-de', 'mixed'];

// Schrittweise Migrationen: MIGRATIONS[n] macht aus Version n die Version n + 1.
const MIGRATIONS = {};

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function emptyData() {
  return { version: SCHEMA_VERSION, decks: [], progress: {}, settings: { direction: 'de-es' } };
}

export function cardId(deckId, es) {
  return `${deckId}:${cardKey(es)}`;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function checkSide(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path}: muss eine Liste sein`);
  } else if (value.length === 0) {
    errors.push(`${path}: darf nicht leer sein`);
  } else if (!value.every(isText)) {
    errors.push(`${path}: enthält einen leeren oder ungültigen Eintrag`);
  }
  return Array.isArray(value) ? [...value] : [];
}

function checkCard(card, path, errors) {
  if (!isObject(card)) {
    errors.push(`${path}: muss ein Objekt sein`);
    return null;
  }
  const es = checkSide(card.es, `${path}.es`, errors);
  const de = checkSide(card.de, `${path}.de`, errors);
  const note = card.note ?? '';
  if (typeof note !== 'string') errors.push(`${path}.note: muss Text sein`);
  return { es, de, note };
}

function checkDecks(decks, errors) {
  if (!Array.isArray(decks)) {
    errors.push('decks: muss eine Liste sein');
    return [];
  }
  const ids = new Set();
  return decks.map((deck, i) => {
    const path = `decks[${i}]`;
    if (!isObject(deck)) {
      errors.push(`${path}: muss ein Objekt sein`);
      return null;
    }
    if (!isText(deck.id)) errors.push(`${path}.id: darf nicht leer sein`);
    else if (ids.has(deck.id)) errors.push(`${path}.id: "${deck.id}" kommt doppelt vor`);
    ids.add(deck.id);
    if (!isText(deck.name)) errors.push(`${path}.name: darf nicht leer sein`);
    if (!Array.isArray(deck.cards)) {
      errors.push(`${path}.cards: muss eine Liste sein`);
      return null;
    }
    const cards = deck.cards.map((card, j) => checkCard(card, `${path}.cards[${j}]`, errors));
    return { id: deck.id, name: deck.name, cards };
  });
}

function checkProgress(progress, errors) {
  if (progress === undefined) return {};
  if (!isObject(progress)) {
    errors.push('progress: muss ein Objekt sein');
    return {};
  }
  const result = {};
  for (const [id, entry] of Object.entries(progress)) {
    const path = `progress["${id}"]`;
    if (!isObject(entry)) {
      errors.push(`${path}: muss ein Objekt sein`);
      continue;
    }
    if (!isCount(entry.correct)) errors.push(`${path}.correct: muss eine ganze Zahl ≥ 0 sein`);
    if (!isCount(entry.wrong)) errors.push(`${path}.wrong: muss eine ganze Zahl ≥ 0 sein`);
    result[id] = { correct: entry.correct, wrong: entry.wrong };
  }
  return result;
}

function checkSettings(settings, errors) {
  const defaults = emptyData().settings;
  if (settings === undefined) return defaults;
  if (!isObject(settings)) {
    errors.push('settings: muss ein Objekt sein');
    return defaults;
  }
  const direction = settings.direction ?? defaults.direction;
  if (!DIRECTIONS.includes(direction)) {
    errors.push(`settings.direction: muss "de-es", "es-de" oder "mixed" sein`);
  }
  return { direction };
}

// Gibt immer eine bereinigte Kopie zurück; unbekannte Felder werden verworfen.
export function validate(data) {
  if (!isObject(data)) return { ok: false, errors: ['Daten müssen ein Objekt sein'] };

  const errors = [];
  if (data.version !== SCHEMA_VERSION) {
    errors.push(`version: muss ${SCHEMA_VERSION} sein`);
  }
  const clean = {
    version: SCHEMA_VERSION,
    decks: checkDecks(data.decks, errors),
    progress: checkProgress(data.progress, errors),
    settings: checkSettings(data.settings, errors),
  };
  return errors.length > 0 ? { ok: false, errors } : { ok: true, data: clean };
}

export function migrate(raw) {
  if (!isObject(raw)) return { ok: false, error: 'Daten müssen ein Objekt sein' };
  let version = raw.version;
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'Keine gültige Versionsnummer gefunden' };
  }
  if (version > SCHEMA_VERSION) {
    return { ok: false, error: 'Backup stammt aus einer neueren Version der App' };
  }
  let data = raw;
  while (version < SCHEMA_VERSION) {
    data = MIGRATIONS[version](data);
    version += 1;
  }
  return { ok: true, data };
}

// Text → geprüfte Daten. Schreibt nichts.
function parseStored(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Datei ist kein gültiges JSON' };
  }
  const migrated = migrate(raw);
  if (!migrated.ok) return migrated;
  const checked = validate(migrated.data);
  if (!checked.ok) return { ok: false, error: checked.errors.join('\n') };
  return checked;
}

export function load(storage = defaultStorage()) {
  let text = null;
  try {
    text = storage ? storage.getItem(STORAGE_KEY) : null;
  } catch {
    return { data: emptyData(), warning: null };
  }
  if (text === null) return { data: emptyData(), warning: null };

  const parsed = parseStored(text);
  if (parsed.ok) return { data: parsed.data, warning: null };

  try {
    if (storage.getItem(BACKUP_KEY) === null) storage.setItem(BACKUP_KEY, text);
  } catch {
    // Sicherung ist nur ein Bonus.
  }
  return {
    data: emptyData(),
    warning: 'Die gespeicherten Daten waren beschädigt. Die App startet leer, die alten Daten wurden gesichert.',
  };
}

export function save(data, storage = defaultStorage()) {
  const checked = validate(data);
  if (!checked.ok || !storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(checked.data));
    return true;
  } catch {
    return false;
  }
}

export function exportJSON(data, now = new Date()) {
  return JSON.stringify({ ...data, exportedAt: now.toISOString() }, null, 2);
}

export function exportFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `vokabeln-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

// Prüft ein Backup vollständig, schreibt aber nichts. Die App speichert erst bei ok.
export function importJSON(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'Datei ist leer' };
  }
  return parseStored(text);
}
