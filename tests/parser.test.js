import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards, cardKey, cardToLine } from '../src/parser.js';

test('cardToLine ist die Umkehrung von parseCards', () => {
  const line = 'el coche / el carro ; das Auto ; m; Lateinamerika: carro';
  const card = parseCards(line).cards[0];
  assert.equal(cardToLine(card), line);
  assert.equal(cardToLine({ es: ['sí'], de: ['ja'], note: '' }), 'sí ; ja');
});

test('einfache Zeile', () => {
  const { cards, errors, duplicates } = parseCards('el perro ; der Hund');
  assert.deepEqual(cards, [{ es: ['el perro'], de: ['der Hund'], note: '' }]);
  assert.deepEqual(errors, []);
  assert.deepEqual(duplicates, []);
});

test('Zeile mit Notiz', () => {
  const { cards } = parseCards('hablar ; sprechen ; regelmäßiges Verb');
  assert.equal(cards[0].note, 'regelmäßiges Verb');
});

test('Varianten mit / werden getrennt und getrimmt', () => {
  const { cards } = parseCards('el coche / el carro ; das Auto/der Wagen');
  assert.deepEqual(cards[0].es, ['el coche', 'el carro']);
  assert.deepEqual(cards[0].de, ['das Auto', 'der Wagen']);
});

test('leere Varianten fallen weg', () => {
  const { cards } = parseCards('el coche / ; das Auto');
  assert.deepEqual(cards[0].es, ['el coche']);
});

test('nur Schrägstriche auf einer Seite ergibt Fehler', () => {
  const { cards, errors } = parseCards(' / ; das Auto');
  assert.equal(cards.length, 0);
  assert.equal(errors[0].message, 'Spanische Seite ist leer');
});

test('Windows-, Unix- und alte Mac-Zeilenumbrüche', () => {
  const { cards } = parseCards('uno ; eins\r\ndos ; zwei\ntres ; drei\rcuatro ; vier');
  assert.deepEqual(cards.map((c) => c.es[0]), ['uno', 'dos', 'tres', 'cuatro']);
});

test('leere Eingabe', () => {
  assert.deepEqual(parseCards(''), { cards: [], errors: [], duplicates: [] });
  assert.deepEqual(parseCards(undefined), { cards: [], errors: [], duplicates: [] });
});

test('nur Leerzeichen und leere Zeilen', () => {
  assert.deepEqual(parseCards('   \n\t\n\r\n  '), { cards: [], errors: [], duplicates: [] });
});

test('Kommentarzeilen mit # werden ignoriert', () => {
  const { cards, errors } = parseCards('# Kapitel 1\n  # eingerückt\nsí ; ja');
  assert.equal(cards.length, 1);
  assert.deepEqual(errors, []);
});

test('Zeile ohne Semikolon ergibt Fehler mit Zeilennummer', () => {
  const { cards, errors } = parseCards('hola ; hallo\nadiós tschüss');
  assert.equal(cards.length, 1);
  assert.deepEqual(errors, [{ line: 2, text: 'adiós tschüss', message: 'Kein Semikolon gefunden' }]);
});

test('leere spanische oder deutsche Seite ergibt Fehler', () => {
  const { cards, errors } = parseCards('; das Auto\ncoche ;\n ; ');
  assert.equal(cards.length, 0);
  assert.deepEqual(
    errors.map((e) => [e.line, e.message]),
    [
      [1, 'Spanische Seite ist leer'],
      [2, 'Deutsche Seite ist leer'],
      [3, 'Spanische Seite ist leer'],
    ],
  );
});

test('Zeilennummern zählen leere Zeilen und Kommentare mit', () => {
  const { errors } = parseCards('# Kommentar\n\nhola ; hallo\n\nfalsch');
  assert.equal(errors[0].line, 5);
});

test('mehrere Semikolons: Rest gehört zur Notiz', () => {
  const { cards } = parseCards('ir ; gehen ; unregelmäßig; voy ; vas');
  assert.equal(cards[0].note, 'unregelmäßig; voy ; vas');
});

test('leere Notiz nach drittem Semikolon', () => {
  const { cards } = parseCards('ir ; gehen ;   ');
  assert.equal(cards[0].note, '');
});

test('Duplikate werden übersprungen und gemeldet', () => {
  const { cards, duplicates } = parseCards('el perro ; der Hund\nEl  Perro ; Hund\nel gato ; die Katze');
  assert.equal(cards.length, 2);
  assert.deepEqual(duplicates, [{ line: 2, text: 'El  Perro ; Hund' }]);
});

test('Akzente unterscheiden Karten (año ≠ ano)', () => {
  const { cards, duplicates } = parseCards('el año ; das Jahr\nel ano ; der After');
  assert.equal(cards.length, 2);
  assert.equal(duplicates.length, 0);
});

test('ñ, ü, ¿ und ¡ bleiben im Text erhalten', () => {
  const { cards } = parseCards('¿Qué tal? ; Wie geht\'s?\n¡Hola! ; Hallo!\nel niño / el pingüino ; das Kind');
  assert.deepEqual(cards.map((c) => c.es), [['¿Qué tal?'], ['¡Hola!'], ['el niño', 'el pingüino']]);
});

test('BOM am Dateianfang wird entfernt', () => {
  const { cards } = parseCards('﻿hola ; hallo');
  assert.equal(cards[0].es[0], 'hola');
});

test('cardKey normalisiert Schreibung, Leerzeichen und Satzzeichen am Rand', () => {
  assert.equal(cardKey(['¿Qué  TAL?']), 'qué tal');
  assert.equal(cardKey(['el coche', 'El Carro']), 'el coche/el carro');
  assert.notEqual(cardKey(['año']), cardKey(['ano']));
});
