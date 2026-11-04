// Oberfläche. Die Logik steckt in parser.js, check.js, storage.js, decks.js und quiz.js.
// Benutzertexte nur über textContent bzw. Textknoten einsetzen, nie über innerHTML.

import { parseCards, cardToLine } from './parser.js';
import { checkAnswer } from './check.js';
import { load, save, exportJSON, exportFileName, importJSON, cardId } from './storage.js';
import {
  createDeck, renameDeck, deleteDeck, splitNew, addCards, updateCard, deleteCard,
  recordResult, importSummary, loadBuiltinDecks, plural,
} from './decks.js';
import {
  createQuiz, currentCard, answer, isFinished, remaining, firstTryCorrect, groupCards, sides,
} from './quiz.js';

const main = document.getElementById('app');
const noticeBox = document.getElementById('notices');

const state = {
  data: null,
  builtin: [],
  loadingBuiltin: true,
  view: 'home',
  deckId: null,
  pasteDraft: '',
  quiz: null,
};

// --- Hilfsfunktionen ---

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...present(children));
  return node;
}

// Listen glätten und leere Einträge (null, undefined, false) weglassen.
function present(children) {
  return children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
}

function fill(node, ...children) {
  node.replaceChildren(...present(children));
}

const cardCount = (n) => plural(n, 'Karte', 'Karten');

function notify(text, kind = 'warn') {
  const notice = el('div', { class: `notice ${kind}`, role: kind === 'ok' ? 'status' : 'alert' },
    el('span', { textContent: text }),
    el('button', { type: 'button', textContent: '×', ariaLabel: 'Hinweis schließen', onclick: () => notice.remove() }));
  noticeBox.append(notice);
  if (kind === 'ok') setTimeout(() => notice.remove(), 4000);
}

function persist() {
  if (!save(state.data)) {
    notify('Speichern fehlgeschlagen. Ist der Speicher voll oder im privaten Modus gesperrt? Ein Backup sichert deine Daten.', 'error');
  }
}

function allDecks() {
  return [...state.builtin, ...state.data.decks];
}

function findAnyDeck(id) {
  return allDecks().find((d) => d.id === id) ?? null;
}

function show(view, deckId = state.deckId) {
  if (deckId !== state.deckId) state.pasteDraft = '';
  state.view = view;
  state.deckId = deckId;
  render();
  window.scrollTo(0, 0);
}

function render() {
  const views = { home: homeView, deck: deckView, quiz: quizView };
  main.replaceChildren(views[state.view]());
  main.querySelector('[data-autofocus]')?.focus();
}

// Löschen mit Bestätigung direkt in der Oberfläche statt confirm().
function confirmButton(label, question, yesLabel, onConfirm) {
  const wrap = el('div', { class: 'confirm' });
  const reset = () => wrap.replaceChildren(
    el('button', { type: 'button', class: 'danger-outline', textContent: label, onclick: ask }));
  function ask() {
    wrap.replaceChildren(
      el('span', { textContent: question }),
      el('button', { type: 'button', class: 'danger', textContent: yesLabel, onclick: onConfirm }),
      el('button', { type: 'button', textContent: 'Abbrechen', onclick: reset }));
  }
  reset();
  return wrap;
}

// --- Übersicht ---

function homeView() {
  const own = state.data.decks;
  return el('div', {},
    directionPicker(),
    el('h2', { textContent: 'Stapel' }),
    el('p', { class: 'group-title', textContent: 'Aus dem Buch' }),
    state.loadingBuiltin
      ? el('p', { class: 'muted', textContent: 'Kapitel werden geladen …' })
      : state.builtin.length === 0
        ? el('p', { class: 'muted', textContent: 'Noch keine Kapitel. Lege sie als Textdateien in decks/ ab und trage sie in decks/index.json ein.' })
        : el('ul', { class: 'deck-list' }, state.builtin.map(deckItem)),
    el('p', { class: 'group-title', textContent: 'Eigene Stapel' }),
    own.length === 0
      ? el('p', { class: 'muted', textContent: 'Noch keine eigenen Stapel.' })
      : el('ul', { class: 'deck-list' }, own.map(deckItem)),
    newDeckForm(),
    backupSection());
}

function directionPicker() {
  const options = [['de-es', 'Deutsch → Spanisch'], ['es-de', 'Spanisch → Deutsch']];
  return el('fieldset', { class: 'direction' },
    el('legend', { textContent: 'Abfragerichtung' }),
    options.map(([value, label]) => el('label', {},
      el('input', {
        type: 'radio',
        name: 'direction',
        value,
        checked: state.data.settings.direction === value,
        onchange: () => {
          state.data.settings.direction = value;
          persist();
        },
      }),
      label)));
}

function deckItem(deck) {
  return el('li', {},
    el('button', { type: 'button', class: 'deck-open', onclick: () => show('deck', deck.id) },
      el('span', { class: 'deck-name', textContent: deck.name }),
      el('span', { class: 'muted', textContent: cardCount(deck.cards.length) })),
    el('button', {
      type: 'button',
      class: 'primary',
      textContent: 'Lernen',
      disabled: deck.cards.length === 0,
      onclick: () => startQuiz(deck),
    }));
}

function newDeckForm() {
  const input = el('input', { type: 'text', placeholder: 'Name des neuen Stapels', ariaLabel: 'Name des neuen Stapels', maxLength: 80 });
  const error = el('p', { class: 'error-text' });
  return el('form', {
    class: 'card-box',
    onsubmit: (event) => {
      event.preventDefault();
      const result = createDeck(state.data, input.value);
      if (!result.ok) {
        error.textContent = result.error;
        return;
      }
      persist();
      show('deck', result.deck.id);
    },
  },
  el('h3', { textContent: 'Neuer Stapel', style: 'margin-top:0' }),
  el('div', { class: 'row' }, input, el('button', { type: 'submit', class: 'primary', textContent: 'Anlegen' })),
  error);
}

function backupSection() {
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  const area = el('div');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch {
      notify('Die Datei konnte nicht gelesen werden.', 'error');
      return;
    }
    const result = importJSON(text);
    if (!result.ok) {
      const lines = result.error.split('\n');
      const shown = lines.slice(0, 5).join('\n') + (lines.length > 5 ? `\n… und ${lines.length - 5} weitere Fehler` : '');
      notify(`Import abgelehnt, deine Daten bleiben unverändert.\n${shown}`, 'error');
      return;
    }
    area.replaceChildren(el('div', { class: 'confirm' },
      el('span', { textContent: `Backup mit ${plural(result.data.decks.length, 'eigenem Stapel', 'eigenen Stapeln')} gefunden. Es ersetzt alle aktuellen Daten.` }),
      el('button', {
        type: 'button',
        class: 'danger',
        textContent: 'Daten ersetzen',
        onclick: () => {
          if (!save(result.data)) {
            notify('Speichern fehlgeschlagen, deine bisherigen Daten bleiben erhalten.', 'error');
            return;
          }
          state.data = result.data;
          notify('Backup importiert.', 'ok');
          render();
        },
      }),
      el('button', { type: 'button', textContent: 'Abbrechen', onclick: () => area.replaceChildren() })));
  });

  return el('section', { class: 'card-box' },
    el('h3', { textContent: 'Backup', style: 'margin-top:0' }),
    el('p', { class: 'muted', textContent: 'Sichert eigene Stapel, Lernfortschritt und Einstellungen als Datei.' }),
    el('div', { class: 'actions' },
      el('button', { type: 'button', textContent: 'Exportieren', onclick: exportBackup }),
      el('button', { type: 'button', textContent: 'Importieren …', onclick: () => fileInput.click() })),
    fileInput,
    area);
}

function exportBackup() {
  const blob = new Blob([exportJSON(state.data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: exportFileName() });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Stapel-Ansicht ---

function deckView() {
  const deck = findAnyDeck(state.deckId);
  if (!deck) {
    state.view = 'home';
    return homeView();
  }
  return el('div', {},
    el('button', { type: 'button', class: 'link', textContent: '← Übersicht', onclick: () => show('home') }),
    el('h2', { textContent: deck.name }),
    el('p', { class: 'muted', textContent: cardCount(deck.cards.length) }),
    el('div', { class: 'actions' },
      el('button', {
        type: 'button',
        class: 'primary',
        textContent: 'Lernen',
        disabled: deck.cards.length === 0,
        onclick: () => startQuiz(deck),
      })),
    deck.builtin
      ? el('p', { class: 'muted', textContent: `Kapitel aus dem Buch, schreibgeschützt. Änderungen bitte in der Datei decks/${deck.file} vornehmen.` })
      : [pasteSection(deck), renameSection(deck)],
    el('h3', { textContent: 'Karten' }),
    deck.cards.length === 0
      ? el('p', { class: 'muted', textContent: 'Noch keine Karten. Füge oben welche ein.' })
      : el('ul', { class: 'card-list' }, deck.cards.map((card, i) => cardRow(deck, card, i))),
    deck.builtin ? null : el('div', { class: 'card-box' },
      confirmButton('Stapel löschen', `„${deck.name}“ mit ${cardCount(deck.cards.length)} wirklich löschen?`, 'Ja, löschen', () => {
        deleteDeck(state.data, deck.id);
        persist();
        notify('Stapel gelöscht.', 'ok');
        show('home', null);
      })));
}

function pasteSection(deck) {
  const textarea = el('textarea', {
    value: state.pasteDraft,
    rows: 8,
    spellcheck: false,
    ariaLabel: 'Karten einfügen',
    placeholder: 'el coche / el carro ; das Auto ; Notiz\nhola ; hallo',
  });
  const summary = el('p', { class: 'summary', ariaLive: 'polite' });
  const problems = el('ul', { class: 'problems' });
  const submit = el('button', { type: 'submit', class: 'primary', textContent: 'Karten speichern', disabled: true });

  function update() {
    state.pasteDraft = textarea.value;
    const parsed = parseCards(textarea.value);
    const { fresh, existing } = splitNew(deck, parsed.cards);
    summary.textContent = textarea.value.trim() === '' ? '' : importSummary(parsed, existing.length);
    fill(problems,
      parsed.errors.map((e) => el('li', { textContent: `Zeile ${e.line}: ${e.message} – „${e.text}“` })),
      parsed.duplicates.map((d) => el('li', { class: 'info', textContent: `Zeile ${d.line}: doppelt, wird übersprungen – „${d.text}“` })),
      existing.map((c) => el('li', { class: 'info', textContent: `„${c.es.join(' / ')}“ ist schon im Stapel, wird übersprungen` })));
    submit.disabled = fresh.length === 0;
    submit.textContent = fresh.length > 0 ? `${cardCount(fresh.length)} speichern` : 'Karten speichern';
  }
  textarea.addEventListener('input', update);
  update();

  return el('form', {
    class: 'card-box',
    onsubmit: (event) => {
      event.preventDefault();
      const parsed = parseCards(textarea.value);
      const added = addCards(deck, parsed.cards);
      persist();
      // Fehlerhafte Zeilen bleiben zum Korrigieren stehen.
      state.pasteDraft = parsed.errors.map((e) => e.text).join('\n');
      notify(`${cardCount(added)} gespeichert.${parsed.errors.length > 0 ? ' Fehlerhafte Zeilen stehen noch im Textfeld.' : ''}`, 'ok');
      render();
    },
  },
  el('h3', { textContent: 'Karten einfügen', style: 'margin-top:0' }),
  el('p', { class: 'muted', textContent: 'Eine Karte pro Zeile: spanisch ; deutsch ; notiz (optional). Mehrere richtige Antworten mit / trennen.' }),
  textarea, summary, problems,
  el('div', { class: 'actions' }, submit));
}

function renameSection(deck) {
  const input = el('input', { type: 'text', value: deck.name, ariaLabel: 'Neuer Name', maxLength: 80 });
  const error = el('p', { class: 'error-text' });
  return el('form', {
    class: 'card-box',
    onsubmit: (event) => {
      event.preventDefault();
      const result = renameDeck(state.data, deck.id, input.value);
      if (!result.ok) {
        error.textContent = result.error;
        return;
      }
      persist();
      notify('Stapel umbenannt.', 'ok');
      render();
    },
  },
  el('h3', { textContent: 'Umbenennen', style: 'margin-top:0' }),
  el('div', { class: 'row' }, input, el('button', { type: 'submit', textContent: 'Speichern' })),
  error);
}

function cardRow(deck, card, index) {
  const li = el('li');
  const progress = state.data.progress[cardId(deck.id, card.es)];

  function showCard() {
    fill(li,
      el('div', { class: 'card-es', lang: 'es', textContent: card.es.join(' / ') }),
      el('div', { textContent: card.de.join(' / ') }),
      card.note ? el('div', { class: 'card-note', textContent: card.note }) : null,
      progress ? el('div', { class: 'card-stats', textContent: `✓ ${progress.correct} · ✗ ${progress.wrong}` }) : null,
      deck.builtin ? null : el('div', { class: 'actions' },
        el('button', { type: 'button', textContent: 'Bearbeiten', onclick: editCard }),
        confirmButton('Löschen', 'Karte löschen?', 'Ja, löschen', () => {
          deleteCard(state.data, deck.id, index);
          persist();
          render();
        })));
  }

  function editCard() {
    const input = el('input', { type: 'text', value: cardToLine(card), ariaLabel: 'Karte bearbeiten', spellcheck: false, 'data-autofocus': '' });
    const error = el('p', { class: 'error-text' });
    li.replaceChildren(el('form', {
      onsubmit: (event) => {
        event.preventDefault();
        const result = updateCard(state.data, deck.id, index, input.value);
        if (!result.ok) {
          error.textContent = result.error;
          return;
        }
        persist();
        render();
      },
    },
    input, error,
    el('div', { class: 'actions' },
      el('button', { type: 'submit', class: 'primary', textContent: 'Speichern' }),
      el('button', { type: 'button', textContent: 'Abbrechen', onclick: showCard }))));
    input.focus();
  }

  showCard();
  return li;
}

// --- Abfrage ---

// subset: nur diese Karten abfragen (z. B. die zum Wiederholen), sonst den ganzen Stapel.
function startQuiz(deck, subset = null) {
  const cards = subset ?? deck.cards.map((card) => ({ ...card, id: cardId(deck.id, card.es) }));
  state.quiz = {
    run: createQuiz(cards),
    deckId: deck.id,
    deckName: deck.name,
    direction: state.data.settings.direction,
    stopped: false,
  };
  show('quiz', deck.id);
}

function stopQuiz() {
  const quiz = state.quiz;
  if (quiz.run.firstGrade.size === 0) {
    show('deck', quiz.deckId);
    return;
  }
  quiz.stopped = true;
  render();
  window.scrollTo(0, 0);
}

function quizView() {
  const quiz = state.quiz;
  if (!quiz) return homeView();
  if (quiz.stopped || isFinished(quiz.run)) return summaryView();

  const card = currentCard(quiz.run);
  const { prompt, answers, answerLang } = sides(card, quiz.direction);
  const target = answerLang === 'es' ? 'Spanisch' : 'Deutsch';
  let checked = false;
  let grade = 'falsch';

  const input = el('input', {
    type: 'text',
    class: 'answer',
    lang: answerLang,
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: false,
    enterKeyHint: 'done',
    ariaLabel: `Antwort auf ${target}`,
    'data-autofocus': '',
  });
  const feedback = el('div', { class: 'feedback', ariaLive: 'polite' });
  const submit = el('button', { type: 'submit', class: 'primary', textContent: 'Prüfen' });
  const override = el('button', {
    type: 'button',
    hidden: true,
    textContent: 'Ich lag doch richtig',
    onclick: () => {
      grade = 'okay';
      override.hidden = true;
      feedback.querySelector('.result').replaceWith(resultBox('richtig', 'Als richtig gewertet.', null));
      input.focus();
    },
  });

  function resultBox(kind, title, solution) {
    return el('div', { class: `result ${kind}` }, title,
      solution ? el('span', { class: 'solution', lang: answerLang, textContent: solution }) : null);
  }

  function check() {
    const result = checkAnswer(input.value, answers);
    checked = true;
    grade = { richtig: 'perfekt', 'fast richtig': 'okay', falsch: 'falsch' }[result.result];
    input.readOnly = true;
    const all = answers.join(' / ');
    const box = {
      richtig: () => resultBox('richtig', 'Richtig!', answers.length > 1 ? `Möglich: ${all}` : null),
      'fast richtig': () => resultBox('fast', 'Fast richtig – achte auf die Schreibweise:', result.expected),
      falsch: () => resultBox('falsch', 'Leider falsch. Richtig ist:', all),
    }[result.result]();
    fill(feedback, box, card.note ? el('p', { class: 'note', textContent: card.note }) : null);
    override.hidden = grade !== 'falsch';
    submit.textContent = 'Weiter';
  }

  function next() {
    answer(quiz.run, grade);
    recordResult(state.data, card.id, grade !== 'falsch');
    persist();
    render();
  }

  return el('div', {},
    el('div', { class: 'quiz-head' },
      el('button', { type: 'button', class: 'link', textContent: '← Beenden', onclick: stopQuiz }),
      el('span', { class: 'muted', textContent: `Noch ${remaining(quiz.run)} · Runde ${quiz.run.round}` })),
    el('p', { class: 'prompt-label', textContent: `${quiz.deckName} · Auf ${target}:` }),
    el('p', { class: 'prompt', lang: answerLang === 'es' ? 'de' : 'es', textContent: prompt.join(' / ') }),
    el('form', {
      onsubmit: (event) => {
        event.preventDefault();
        if (checked) next();
        else check();
      },
    },
    input,
    feedback,
    el('div', { class: 'actions' }, submit, override)));
}

const GROUP_INFO = [
  ['falsch', 'Gruppe 1 · Wiederholen', 'Beim ersten Versuch falsch'],
  ['okay', 'Gruppe 2 · Okay', 'Fast richtig oder selbst als richtig gewertet'],
  ['perfekt', 'Gruppe 3 · Perfekt', 'Beim ersten Versuch genau richtig'],
];

function summaryView() {
  const quiz = state.quiz;
  const groups = groupCards(quiz.run);
  const answered = quiz.run.firstGrade.size;
  const first = firstTryCorrect(quiz.run);
  const deck = findAnyDeck(quiz.deckId);
  const toRepeat = groups.falsch.map((entry) => entry.card);

  return el('div', {},
    el('h2', { textContent: quiz.stopped ? 'Abfrage beendet' : 'Geschafft!' }),
    el('p', { class: 'big-number', textContent: `${first} / ${answered}` }),
    el('p', { textContent: `${cardCount(first)} beim ersten Versuch richtig${answered > 0 ? ` (${Math.round((first / answered) * 100)} %)` : ''}.` }),
    quiz.stopped ? el('p', { class: 'muted', textContent: `Ausgewertet: ${cardCount(answered)}, die du beantwortet hast.` }) : null,
    el('div', { class: 'actions' },
      deck && toRepeat.length > 0
        ? el('button', { type: 'button', class: 'primary', textContent: `Gruppe 1 üben (${toRepeat.length})`, 'data-autofocus': '', onclick: () => startQuiz(deck, toRepeat) })
        : null,
      deck ? el('button', { type: 'button', textContent: 'Ganzen Stapel nochmal', onclick: () => startQuiz(deck) }) : null,
      el('button', { type: 'button', textContent: 'Zur Übersicht', onclick: () => show('home') })),
    GROUP_INFO.map(([key, title, hint]) => groups[key].length === 0 ? null : el('section', { class: `group group-${key}` },
      el('h3', {}, title, el('span', { class: 'group-count', textContent: ` (${groups[key].length})` })),
      el('p', { class: 'muted', textContent: hint }),
      el('ul', { class: 'card-list' }, groups[key].map(({ card, wrong }) => el('li', {},
        el('div', { class: 'card-es', lang: 'es', textContent: card.es.join(' / ') }),
        el('div', { textContent: card.de.join(' / ') }),
        wrong > 1 ? el('div', { class: 'card-stats', textContent: `${wrong}× falsch` }) : null))))));
}

// --- Start ---

async function init() {
  const { data, warning } = load();
  state.data = data;
  if (warning) notify(warning, 'warn');
  document.getElementById('home').addEventListener('click', () => show('home'));
  render();

  const { decks, problems } = await loadBuiltinDecks((url, options) => fetch(url, options));
  state.builtin = decks;
  state.loadingBuiltin = false;
  problems.forEach((problem) => notify(problem, 'warn'));
  if (state.view === 'home') render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Ohne Service Worker läuft die App trotzdem, nur nicht offline.
    });
  }
}

init();
