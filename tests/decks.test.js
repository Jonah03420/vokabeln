import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, cardId, validate } from '../src/storage.js';
import { parseCards } from '../src/parser.js';
import {
  createDeck, renameDeck, deleteDeck, findDeck, splitNew, addCards,
  updateCard, deleteCard, recordResult, importSummary, loadBuiltinDecks, plural,
  cardStatus, quizCards, deckStats, statsSummary,
} from '../src/decks.js';

function dataWithDeck(lines = 'el perro ; der Hund\nel gato ; die Katze') {
  const data = emptyData();
  const { deck } = createDeck(data, 'Tiere');
  addCards(deck, parseCards(lines).cards);
  return { data, deck };
}

// --- Stapel ---

test('Stapel anlegen: Name wird getrimmt, ID ist eindeutig, Daten bleiben gültig', () => {
  const data = emptyData();
  const a = createDeck(data, '  Kapitel 3  ');
  const b = createDeck(data, 'Kapitel 3');
  assert.equal(a.deck.name, 'Kapitel 3');
  assert.match(a.deck.id, /^eigen-/);
  assert.notEqual(a.deck.id, b.deck.id);
  assert.equal(validate(data).ok, true);
});

test('Stapel ohne Namen wird abgelehnt', () => {
  const data = emptyData();
  assert.equal(createDeck(data, '   ').ok, false);
  assert.equal(createDeck(data, undefined).ok, false);
  assert.equal(data.decks.length, 0);
});

test('Stapel umbenennen', () => {
  const { data, deck } = dataWithDeck();
  assert.equal(renameDeck(data, deck.id, ' Animales ').ok, true);
  assert.equal(deck.name, 'Animales');
  assert.equal(renameDeck(data, deck.id, '').ok, false);
  assert.equal(deck.name, 'Animales');
  assert.equal(renameDeck(data, 'gibt-es-nicht', 'X').ok, false);
});

test('Stapel löschen entfernt auch seinen Fortschritt', () => {
  const { data, deck } = dataWithDeck();
  recordResult(data, cardId(deck.id, ['el perro']), true);
  recordResult(data, 'datei:kapitel-01.txt:hola', true);
  assert.equal(deleteDeck(data, deck.id), true);
  assert.equal(findDeck(data, deck.id), null);
  assert.deepEqual(Object.keys(data.progress), ['datei:kapitel-01.txt:hola']);
  assert.equal(deleteDeck(data, deck.id), false);
});

// --- Karten ---

test('addCards überspringt Karten, die schon im Stapel sind', () => {
  const { deck } = dataWithDeck();
  const added = addCards(deck, parseCards('El Perro ; Hund\nel pájaro ; der Vogel').cards);
  assert.equal(added, 1);
  assert.deepEqual(deck.cards.map((c) => c.es[0]), ['el perro', 'el gato', 'el pájaro']);
});

test('splitNew trennt neue und vorhandene Karten', () => {
  const { deck } = dataWithDeck();
  const { fresh, existing } = splitNew(deck, parseCards('el gato ; Katze\nel pez ; Fisch').cards);
  assert.deepEqual(fresh.map((c) => c.es[0]), ['el pez']);
  assert.deepEqual(existing.map((c) => c.es[0]), ['el gato']);
});

test('Karte bearbeiten', () => {
  const { data, deck } = dataWithDeck();
  assert.deepEqual(updateCard(data, deck.id, 1, 'el gato / la gata ; die Katze ; f: la gata'), { ok: true });
  assert.deepEqual(deck.cards[1], { es: ['el gato', 'la gata'], de: ['die Katze'], note: 'f: la gata' });
});

test('Karte bearbeiten: Fortschritt zieht mit, wenn sich die ID ändert', () => {
  const { data, deck } = dataWithDeck();
  recordResult(data, cardId(deck.id, ['el perro']), true);
  updateCard(data, deck.id, 0, 'el perrito ; das Hündchen');
  assert.equal(data.progress[cardId(deck.id, ['el perro'])], undefined);
  assert.deepEqual(data.progress[cardId(deck.id, ['el perrito'])], { correct: 1, wrong: 0 });
});

test('Karte bearbeiten: Fehler ändern nichts', () => {
  const { data, deck } = dataWithDeck();
  const before = structuredClone(deck.cards);
  assert.equal(updateCard(data, deck.id, 0, 'ohne semikolon').ok, false);
  assert.equal(updateCard(data, deck.id, 0, '').ok, false);
  assert.equal(updateCard(data, deck.id, 0, 'a ; b\nc ; d').ok, false);
  assert.equal(updateCard(data, deck.id, 0, 'EL GATO ; Katze').error, 'Diese Karte gibt es im Stapel schon.');
  assert.equal(updateCard(data, deck.id, 9, 'a ; b').ok, false);
  assert.deepEqual(deck.cards, before);
});

test('Karte bearbeiten: gleiche spanische Seite der Karte selbst ist erlaubt', () => {
  const { data, deck } = dataWithDeck();
  assert.equal(updateCard(data, deck.id, 0, 'El perro ; der Hund ; neu').ok, true);
});

test('Karte löschen entfernt auch ihren Fortschritt', () => {
  const { data, deck } = dataWithDeck();
  recordResult(data, cardId(deck.id, ['el gato']), false);
  assert.equal(deleteCard(data, deck.id, 1), true);
  assert.equal(deck.cards.length, 1);
  assert.deepEqual(data.progress, {});
  assert.equal(deleteCard(data, deck.id, 5), false);
});

test('recordResult zählt richtig und falsch', () => {
  const data = emptyData();
  recordResult(data, 'x', true);
  recordResult(data, 'x', false);
  recordResult(data, 'x', true);
  assert.deepEqual(data.progress.x, { correct: 2, wrong: 1 });
  assert.equal(validate(data).ok, true);
});

// --- Vorschau-Text ---

test('importSummary', () => {
  assert.equal(importSummary(parseCards('a ; b')), '1 Karte erkannt');
  assert.equal(importSummary(parseCards('')), '0 Karten erkannt');
  const text = ['a ; b', 'c ; d', 'a ; x', 'kaputt', '', '; leer'].join('\n');
  assert.equal(importSummary(parseCards(text), 1), '2 Karten erkannt, 1 schon im Stapel, 1 doppelt, 2 Fehler in Zeilen 4, 6');
  assert.equal(importSummary(parseCards('a ; b\n\n\n\n\n\nkaputt')), '1 Karte erkannt, 1 Fehler in Zeile 7');
});

test('plural', () => {
  assert.equal(plural(1, 'Karte', 'Karten'), '1 Karte');
  assert.equal(plural(0, 'Karte', 'Karten'), '0 Karten');
});

// --- Mitgelieferte Kapitel ---

function fakeFetch(files) {
  return async (url) => {
    if (files[url] instanceof Error) throw files[url];
    if (!(url in files)) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => files[url] };
  };
}

test('Kapitel werden geladen und geparst', async () => {
  const fetchFn = fakeFetch({
    'decks/index.json': JSON.stringify([{ file: 'kapitel-01.txt', name: 'Kapitel 1 – Saludos' }]),
    'decks/kapitel-01.txt': '# Kapitel 1\r\nhola ; hallo\r\nadiós ; tschüss ; beim Abschied',
  });
  const { decks, problems } = await loadBuiltinDecks(fetchFn);
  assert.deepEqual(problems, []);
  assert.equal(decks.length, 1);
  assert.equal(decks[0].id, 'datei:kapitel-01.txt');
  assert.equal(decks[0].name, 'Kapitel 1 – Saludos');
  assert.equal(decks[0].builtin, true);
  assert.equal(decks[0].cards.length, 2);
});

test('fehlende Kapitelliste ergibt Hinweis statt Absturz', async () => {
  const { decks, problems } = await loadBuiltinDecks(fakeFetch({}));
  assert.deepEqual(decks, []);
  assert.match(problems[0], /index\.json/);
});

test('Netzwerkfehler und kaputtes JSON ergeben Hinweis', async () => {
  const offline = await loadBuiltinDecks(fakeFetch({ 'decks/index.json': new TypeError('offline') }));
  assert.equal(offline.problems.length, 1);
  const broken = await loadBuiltinDecks(fakeFetch({ 'decks/index.json': '{kaputt' }));
  assert.equal(broken.problems.length, 1);
  const wrongType = await loadBuiltinDecks(fakeFetch({ 'decks/index.json': '{"file":"a.txt"}' }));
  assert.match(wrongType.problems[0], /ungültiges Format/);
});

test('ein fehlendes Kapitel verhindert die anderen nicht', async () => {
  const fetchFn = fakeFetch({
    'decks/index.json': JSON.stringify([
      { file: 'fehlt.txt', name: 'Kapitel 2' },
      { file: 'k1.txt' },
      { name: 'ohne Datei' },
      { file: 'k1.txt', name: 'nochmal' },
    ]),
    'decks/k1.txt': 'hola ; hallo\nkaputte zeile',
  });
  const { decks, problems } = await loadBuiltinDecks(fetchFn);
  assert.deepEqual(decks.map((d) => d.name), ['k1.txt']);
  assert.deepEqual(problems, [
    '„Kapitel 2“ (decks/fehlt.txt) konnte nicht geladen werden.',
    '„k1.txt“: 1 fehlerhafte Zeile übersprungen (Zeile 2).',
    'Eintrag 3 in decks/index.json hat keine Datei.',
    '„nochmal“: 1 fehlerhafte Zeile übersprungen (Zeile 2).',
    'decks/k1.txt steht doppelt in der Kapitelliste.',
  ]);
});

// --- Lernstand ---

test('cardStatus: neu, schwach, sitzt', () => {
  assert.equal(cardStatus(undefined), 'neu');
  assert.equal(cardStatus({ correct: 0, wrong: 0 }), 'neu');
  assert.equal(cardStatus({ correct: 0, wrong: 1 }), 'schwach');
  // In einer Runde wird eine falsche Karte wiederholt, bis sie richtig ist: 1:1 bleibt schwach.
  assert.equal(cardStatus({ correct: 1, wrong: 1 }), 'schwach');
  assert.equal(cardStatus({ correct: 3, wrong: 5 }), 'schwach');
  assert.equal(cardStatus({ correct: 2, wrong: 1 }), 'sitzt');
  assert.equal(cardStatus({ correct: 1, wrong: 0 }), 'sitzt');
});

test('quizCards: alle Karten mit ID, ohne den Stapel zu verändern', () => {
  const { data, deck } = dataWithDeck();
  const cards = quizCards(deck, data.progress);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].id, cardId(deck.id, ['el perro']));
  assert.deepEqual(cards[0].es, ['el perro']);
  assert.equal('id' in deck.cards[0], false);
});

test('quizCards: nach Lernstand filtern', () => {
  const { data, deck } = dataWithDeck('el perro ; der Hund\nel gato ; die Katze\nel pez ; der Fisch');
  recordResult(data, cardId(deck.id, ['el perro']), false);
  recordResult(data, cardId(deck.id, ['el perro']), true);
  recordResult(data, cardId(deck.id, ['el gato']), true);
  const es = (filter) => quizCards(deck, data.progress, filter).map((c) => c.es[0]);
  assert.deepEqual(es('schwach'), ['el perro']);
  assert.deepEqual(es('sitzt'), ['el gato']);
  assert.deepEqual(es('neu'), ['el pez']);
  assert.deepEqual(es('alle'), ['el perro', 'el gato', 'el pez']);
});

test('quizCards: leerer Stapel und Fortschritt anderer Stapel', () => {
  const data = emptyData();
  const { deck } = createDeck(data, 'Leer');
  assert.deepEqual(quizCards(deck, data.progress, 'schwach'), []);
  const other = dataWithDeck();
  recordResult(other.data, cardId('anderer', ['el perro']), false);
  assert.equal(quizCards(other.deck, other.data.progress, 'schwach').length, 0);
});

// --- Fortschritt pro Stapel ---

test('deckStats zählt Karten pro Lernstand', () => {
  const { data, deck } = dataWithDeck('el perro ; der Hund\nel gato ; die Katze\nel pez ; der Fisch\nel pájaro ; der Vogel');
  recordResult(data, cardId(deck.id, ['el perro']), false);
  recordResult(data, cardId(deck.id, ['el gato']), true);
  recordResult(data, cardId(deck.id, ['el pez']), true);
  assert.deepEqual(deckStats(deck, data.progress), { total: 4, neu: 1, schwach: 1, sitzt: 2 });
});

test('deckStats: leerer Stapel und Fortschritt ohne passende Karte', () => {
  const data = emptyData();
  const { deck } = createDeck(data, 'Leer');
  data.progress['anderer:el perro'] = { correct: 3, wrong: 0 };
  assert.deepEqual(deckStats(deck, data.progress), { total: 0, neu: 0, schwach: 0, sitzt: 0 });
});

test('statsSummary', () => {
  assert.equal(statsSummary({ total: 0, neu: 0, schwach: 0, sitzt: 0 }), '0 Karten');
  assert.equal(statsSummary({ total: 107, neu: 107, schwach: 0, sitzt: 0 }), '107 Karten · noch nicht geübt');
  assert.equal(statsSummary({ total: 107, neu: 38, schwach: 5, sitzt: 64 }), '107 Karten · 64 sitzen · 5 schwach · 38 neu');
  assert.equal(statsSummary({ total: 2, neu: 0, schwach: 1, sitzt: 1 }), '2 Karten · 1 sitzt · 1 schwach');
  assert.equal(statsSummary({ total: 1, neu: 0, schwach: 0, sitzt: 1 }), '1 Karte · 1 sitzt');
});
