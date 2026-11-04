import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION, STORAGE_KEY, BACKUP_KEY,
  emptyData, validate, migrate, load, save,
  exportJSON, exportFileName, importJSON, cardId,
} from '../src/storage.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

function throwingStorage(name) {
  const fail = () => { throw new DOMException('nicht erlaubt', name); };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

function sampleData() {
  return {
    version: SCHEMA_VERSION,
    decks: [{
      id: 'eigen-1',
      name: 'Meine Wörter',
      cards: [{ es: ['el niño'], de: ['das Kind'], note: '¡ojo!' }],
    }],
    progress: { 'eigen-1:el niño': { correct: 2, wrong: 1 } },
    settings: { direction: 'es-de' },
  };
}

function errorsOf(data) {
  const result = validate(data);
  assert.equal(result.ok, false);
  return result.errors.join('\n');
}

// --- Laden und Speichern ---

test('emptyData ist gültig', () => {
  assert.deepEqual(validate(emptyData()), { ok: true, data: emptyData() });
});

test('Speichern und Laden ergeben dieselben Daten', () => {
  const storage = fakeStorage();
  assert.equal(save(sampleData(), storage), true);
  assert.deepEqual(load(storage), { data: sampleData(), warning: null });
});

test('leerer Speicher ergibt leere Daten ohne Warnung', () => {
  assert.deepEqual(load(fakeStorage()), { data: emptyData(), warning: null });
});

test('kein Speicher vorhanden: kein Absturz', () => {
  assert.deepEqual(load(undefined), { data: emptyData(), warning: null });
  assert.equal(save(sampleData(), undefined), false);
});

test('getItem wirft: leere Daten statt Absturz', () => {
  assert.deepEqual(load(throwingStorage('SecurityError')), { data: emptyData(), warning: null });
});

test('kaputtes JSON: leere Daten, Warnung, Rohtext gesichert', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: '{kaputt' });
  const { data, warning } = load(storage);
  assert.deepEqual(data, emptyData());
  assert.match(warning, /beschädigt/);
  assert.equal(storage.map.get(BACKUP_KEY), '{kaputt');
});

test('bestehende Sicherung wird nicht überschrieben', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: '{neu-kaputt', [BACKUP_KEY]: '{alt' });
  load(storage);
  assert.equal(storage.map.get(BACKUP_KEY), '{alt');
});

test('gültiges JSON mit falscher Struktur wird wie kaputt behandelt', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: '{"version":1,"decks":"nein"}' });
  const { data, warning } = load(storage);
  assert.deepEqual(data, emptyData());
  assert.notEqual(warning, null);
  assert.equal(storage.map.get(BACKUP_KEY), '{"version":1,"decks":"nein"}');
});

test('save bei vollem Speicher gibt false zurück', () => {
  assert.equal(save(sampleData(), throwingStorage('QuotaExceededError')), false);
});

test('save schreibt ungültige Daten nicht', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: 'alt' });
  const broken = sampleData();
  broken.decks[0].cards[0].es = [];
  assert.equal(save(broken, storage), false);
  assert.equal(storage.map.get(STORAGE_KEY), 'alt');
});

// --- Validierung ---

test('kein Objekt, Array oder null ist ungültig', () => {
  for (const value of [null, [], 'text', 42, undefined]) {
    assert.equal(validate(value).ok, false);
  }
});

test('doppelte Stapel-IDs und leerer Name', () => {
  const data = sampleData();
  data.decks.push({ id: 'eigen-1', name: '  ', cards: [] });
  const errors = errorsOf(data);
  assert.match(errors, /decks\[1\]\.id: "eigen-1" kommt doppelt vor/);
  assert.match(errors, /decks\[1\]\.name: darf nicht leer sein/);
});

test('Karte mit leerer Seite oder Text statt Liste', () => {
  const data = sampleData();
  data.decks[0].cards.push({ es: [], de: ['x'] }, { es: 'el gato', de: ['die Katze'] }, { es: ['a'], de: [' '] });
  const errors = errorsOf(data);
  assert.match(errors, /decks\[0\]\.cards\[1\]\.es: darf nicht leer sein/);
  assert.match(errors, /decks\[0\]\.cards\[2\]\.es: muss eine Liste sein/);
  assert.match(errors, /decks\[0\]\.cards\[3\]\.de: enthält einen leeren/);
});

test('Fortschritt muss ganze Zahl ≥ 0 sein', () => {
  const data = sampleData();
  data.progress = { a: { correct: -1, wrong: 0 }, b: { correct: 1, wrong: 1.5 }, c: 'x' };
  const errors = errorsOf(data);
  assert.match(errors, /progress\["a"\]\.correct/);
  assert.match(errors, /progress\["b"\]\.wrong/);
  assert.match(errors, /progress\["c"\]: muss ein Objekt sein/);
});

test('unbekannte Abfragerichtung', () => {
  const data = sampleData();
  data.settings.direction = 'en-es';
  assert.match(errorsOf(data), /settings\.direction/);
});

test('gemischte Abfragerichtung ist gültig', () => {
  const data = sampleData();
  data.settings.direction = 'mixed';
  const result = validate(data);
  assert.equal(result.ok, true);
  assert.equal(result.data.settings.direction, 'mixed');
});

test('fehlende note, progress und settings werden ergänzt', () => {
  const result = validate({
    version: 1,
    decks: [{ id: 'd', name: 'D', cards: [{ es: ['sí'], de: ['ja'] }] }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.decks[0].cards[0].note, '');
  assert.deepEqual(result.data.progress, {});
  assert.deepEqual(result.data.settings, { direction: 'de-es' });
});

test('unbekannte Felder werden entfernt, Eingabe bleibt unverändert', () => {
  const input = { ...sampleData(), extra: 1 };
  input.decks[0].farbe = 'rot';
  const result = validate(input);
  assert.equal(result.ok, true);
  assert.equal('extra' in result.data, false);
  assert.equal('farbe' in result.data.decks[0], false);
  assert.equal(input.decks[0].farbe, 'rot');
  assert.notEqual(result.data.decks[0], input.decks[0]);
});

// --- Migration ---

test('Version fehlt oder ist ungültig', () => {
  assert.equal(migrate({ decks: [] }).ok, false);
  assert.equal(migrate({ version: 0 }).ok, false);
  assert.equal(migrate({ version: '1' }).ok, false);
});

test('neuere Version wird abgelehnt', () => {
  const result = migrate({ version: SCHEMA_VERSION + 1 });
  assert.equal(result.ok, false);
  assert.match(result.error, /neueren Version/);
});

test('aktuelle Version bleibt unverändert', () => {
  assert.deepEqual(migrate(sampleData()), { ok: true, data: sampleData() });
});

// --- Export und Import ---

test('Export und Import ergeben dieselben Daten', () => {
  const text = exportJSON(sampleData(), new Date('2026-10-26T10:00:00Z'));
  assert.match(text, /"exportedAt": "2026-10-26T10:00:00.000Z"/);
  assert.deepEqual(importJSON(text), { ok: true, data: sampleData() });
});

test('Dateiname enthält das Datum', () => {
  assert.equal(exportFileName(new Date(2026, 0, 5)), 'vokabeln-backup-2026-01-05.json');
});

test('kaputte Importe werden abgelehnt', () => {
  for (const text of ['{kaputt', '', '   ', '[]', 'null', '{"version":1,"decks":[{"id":""}]}']) {
    const result = importJSON(text);
    assert.equal(result.ok, false, text);
    assert.equal(typeof result.error, 'string');
  }
  assert.equal(importJSON(undefined).ok, false);
});

test('Import aus neuerer Version wird mit klarer Meldung abgelehnt', () => {
  assert.match(importJSON('{"version":99}').error, /neueren Version/);
});

test('fehlgeschlagener Import lässt den Speicher unverändert', () => {
  const storage = fakeStorage();
  save(sampleData(), storage);
  const before = storage.map.get(STORAGE_KEY);
  const result = importJSON('{"version":1,"decks":"kaputt"}');
  if (result.ok) save(result.data, storage);
  assert.equal(storage.map.get(STORAGE_KEY), before);
});

// --- Karten-ID ---

test('cardId ist stabil und eindeutig', () => {
  assert.equal(cardId('datei:kapitel-01.txt', ['El  Niño']), cardId('datei:kapitel-01.txt', ['el niño']));
  assert.equal(cardId('d', ['¿Qué tal?']), 'd:qué tal');
  assert.notEqual(cardId('a', ['hola']), cardId('b', ['hola']));
  assert.notEqual(cardId('d', ['año']), cardId('d', ['ano']));
});
