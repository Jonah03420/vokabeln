import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shuffle, sides, resolveDirection, createQuiz, currentCard, answer, isFinished,
  remaining, firstTryCorrect, groupCards,
} from '../src/quiz.js';

const cards = [
  { id: 'd:uno', es: ['uno'], de: ['eins'], note: '' },
  { id: 'd:dos', es: ['dos'], de: ['zwei'], note: '' },
  { id: 'd:tres', es: ['tres'], de: ['drei'], note: '' },
];

// Deterministischer Zufall für reproduzierbare Tests.
function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// Beantwortet Karten nach id, bis die Abfrage fertig ist. grades: id → Liste von Bewertungen.
function play(quiz, grades) {
  const used = {};
  while (!isFinished(quiz)) {
    const { id } = currentCard(quiz);
    const list = grades[id] ?? ['perfekt'];
    const i = used[id] ?? 0;
    used[id] = i + 1;
    answer(quiz, list[Math.min(i, list.length - 1)]);
  }
}

const ids = (entries) => entries.map((e) => e.card.id);

test('shuffle behält alle Elemente und ändert die Eingabe nicht', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const result = shuffle(input, seeded(7));
  assert.deepEqual([...result].sort(), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(shuffle([]), []);
});

test('shuffle mischt tatsächlich', () => {
  const input = Array.from({ length: 20 }, (_, i) => i);
  assert.notDeepEqual(shuffle(input, seeded(3)), input);
});

test('sides je nach Richtung', () => {
  assert.deepEqual(sides(cards[0], 'de-es'), { prompt: ['eins'], answers: ['uno'], answerLang: 'es' });
  assert.deepEqual(sides(cards[0], 'es-de'), { prompt: ['uno'], answers: ['eins'], answerLang: 'de' });
});

test('resolveDirection: feste Richtung bleibt, gemischt wählt zufällig', () => {
  assert.equal(resolveDirection('de-es', () => 0.9), 'de-es');
  assert.equal(resolveDirection('es-de', () => 0.1), 'es-de');
  assert.equal(resolveDirection('mixed', () => 0.1), 'de-es');
  assert.equal(resolveDirection('mixed', () => 0.5), 'es-de');
  assert.equal(resolveDirection('mixed', () => 0.99), 'es-de');
  const random = seeded(7);
  const seen = new Set(Array.from({ length: 50 }, () => resolveDirection('mixed', random)));
  assert.deepEqual([...seen].sort(), ['de-es', 'es-de']);
});

test('alles richtig: Runde endet nach jeder Karte genau einmal', () => {
  const quiz = createQuiz(cards, seeded());
  const seen = [];
  while (!isFinished(quiz)) {
    seen.push(currentCard(quiz).id);
    answer(quiz, 'perfekt');
  }
  assert.deepEqual(seen.sort(), cards.map((c) => c.id).sort());
  assert.equal(firstTryCorrect(quiz), 3);
  assert.equal(quiz.round, 1);
  assert.equal(currentCard(quiz), null);
});

test('falsche Karten kommen am Ende erneut, bis sie richtig sind', () => {
  const quiz = createQuiz(cards, seeded());
  const first = currentCard(quiz).id;
  answer(quiz, 'falsch');
  assert.equal(remaining(quiz), 3);
  answer(quiz, 'perfekt');
  answer(quiz, 'okay');
  assert.equal(quiz.round, 2);
  assert.equal(currentCard(quiz).id, first);
  answer(quiz, 'falsch');
  assert.equal(quiz.round, 3);
  assert.equal(currentCard(quiz).id, first);
  answer(quiz, 'perfekt');
  assert.equal(isFinished(quiz), true);
  assert.equal(firstTryCorrect(quiz), 2);
});

test('unbekannte Bewertung wirft einen Fehler', () => {
  const quiz = createQuiz(cards);
  assert.throws(() => answer(quiz, true), /Unbekannte Bewertung/);
  assert.equal(remaining(quiz), 3);
});

test('leere Abfrage ist sofort fertig', () => {
  const quiz = createQuiz([]);
  assert.equal(isFinished(quiz), true);
  answer(quiz, 'perfekt');
  assert.equal(firstTryCorrect(quiz), 0);
  assert.deepEqual(groupCards(quiz), { falsch: [], okay: [], perfekt: [] });
});

// --- Gruppen am Ende ---

test('Gruppen richten sich nach dem ersten Versuch', () => {
  const quiz = createQuiz(cards, seeded());
  play(quiz, { 'd:uno': ['falsch', 'perfekt'], 'd:dos': ['okay'], 'd:tres': ['perfekt'] });
  const groups = groupCards(quiz);
  assert.deepEqual(ids(groups.falsch), ['d:uno']);
  assert.deepEqual(ids(groups.okay), ['d:dos']);
  assert.deepEqual(ids(groups.perfekt), ['d:tres']);
});

test('später richtig beantwortete Karten bleiben in „wiederholen“', () => {
  const quiz = createQuiz(cards, seeded());
  play(quiz, { 'd:uno': ['falsch', 'falsch', 'perfekt'], 'd:dos': ['falsch', 'okay'] });
  const groups = groupCards(quiz);
  assert.deepEqual(groups.falsch, [
    { card: cards[0], wrong: 2 },
    { card: cards[1], wrong: 1 },
  ]);
  assert.deepEqual(ids(groups.perfekt), ['d:tres']);
  assert.equal(firstTryCorrect(quiz), 1);
});

test('„wiederholen“ ist nach Anzahl Fehlversuche sortiert', () => {
  const quiz = createQuiz(cards, seeded(5));
  play(quiz, { 'd:uno': ['falsch', 'perfekt'], 'd:tres': ['falsch', 'falsch', 'falsch', 'okay'] });
  assert.deepEqual(groupCards(quiz).falsch.map((e) => [e.card.id, e.wrong]), [['d:tres', 3], ['d:uno', 1]]);
});

test('abgebrochene Abfrage zeigt nur beantwortete Karten', () => {
  const quiz = createQuiz(cards, seeded());
  const first = currentCard(quiz);
  answer(quiz, 'okay');
  const groups = groupCards(quiz);
  assert.deepEqual(groups.okay, [{ card: first, wrong: 0 }]);
  assert.equal(groups.falsch.length + groups.perfekt.length, 0);
});
