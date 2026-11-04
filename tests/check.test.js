import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, normalize, stripAccents } from '../src/check.js';

test('exakt richtig', () => {
  assert.deepEqual(checkAnswer('el perro', ['el perro']), { result: 'richtig', expected: 'el perro' });
});

test('Groß-/Kleinschreibung egal', () => {
  assert.equal(checkAnswer('EL Perro', ['el perro']).result, 'richtig');
});

test('zusätzliche Leerzeichen egal', () => {
  assert.equal(checkAnswer('  el   perro \t', ['el perro']).result, 'richtig');
});

test('Satzzeichen am Anfang und Ende werden ignoriert', () => {
  assert.equal(checkAnswer('cómo estás', ['¿Cómo estás?']).result, 'richtig');
  assert.equal(checkAnswer('¡Hola!', ['hola']).result, 'richtig');
  assert.equal(checkAnswer('Hallo.', ['Hallo']).result, 'richtig');
});

test('typografische Apostrophe vom Handy zählen wie normale', () => {
  assert.equal(checkAnswer('Wie geht’s?', ["Wie geht's?"]).result, 'richtig');
  assert.equal(checkAnswer("wie geht's", ['Wie geht‘s?']).result, 'richtig');
});

test('Satzzeichen in der Mitte zählen', () => {
  assert.equal(checkAnswer('hola amigo', ['hola, amigo']).result, 'falsch');
});

test('ohne Akzent: fast richtig mit korrekter Schreibweise', () => {
  assert.deepEqual(checkAnswer('cafe', ['el café', 'café']), { result: 'fast richtig', expected: 'café' });
});

test('ohne Tilde: fast richtig', () => {
  assert.deepEqual(checkAnswer('el nino', ['el niño']), { result: 'fast richtig', expected: 'el niño' });
});

test('ohne Trema: fast richtig', () => {
  assert.equal(checkAnswer('pinguino', ['pingüino']).result, 'fast richtig');
});

test('deutsche Umlaute ohne Punkte: fast richtig', () => {
  assert.equal(checkAnswer('Tschuss', ['tschüss']).result, 'fast richtig');
});

test('fehlende Akzente und Satzzeichen zusammen: fast richtig', () => {
  assert.equal(checkAnswer('como estas', ['¿Cómo estás?']).result, 'fast richtig');
});

test('jede Variante wird akzeptiert', () => {
  assert.deepEqual(checkAnswer('el carro', ['el coche', 'el carro']), { result: 'richtig', expected: 'el carro' });
});

test('exakter Treffer hat Vorrang vor fast richtig', () => {
  assert.equal(checkAnswer('ano', ['año', 'ano']).result, 'richtig');
});

test('falsche Antwort nennt die erste Variante', () => {
  assert.deepEqual(checkAnswer('el gato', ['el coche', 'el carro']), { result: 'falsch', expected: 'el coche' });
});

test('leere Eingabe und nur Leerzeichen sind falsch', () => {
  assert.equal(checkAnswer('', ['hola']).result, 'falsch');
  assert.equal(checkAnswer('   ', ['hola']).result, 'falsch');
  assert.equal(checkAnswer('¿?', ['hola']).result, 'falsch');
});

test('keine Varianten: falsch statt Absturz', () => {
  assert.deepEqual(checkAnswer('hola', []), { result: 'falsch', expected: '' });
});

test('normalize und stripAccents', () => {
  assert.equal(normalize('  ¡Buenos   DÍAS! '), 'buenos días');
  assert.equal(normalize(undefined), '');
  assert.equal(stripAccents('ñandú pingüino café'), 'nandu pinguino cafe');
  // zerlegte Form (NFD) aus manchen Tastaturen wird gleich behandelt
  assert.equal(checkAnswer('café', ['café']).result, 'richtig');
});
