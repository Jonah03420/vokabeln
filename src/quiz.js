// Ablauf einer Abfrage-Runde. Kein DOM.
// Karten brauchen eine eindeutige id. Falsche Karten kommen am Ende erneut, bis alle richtig sind.

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// direction "de-es": Deutsch wird gezeigt, Spanisch wird gefragt.
export function sides(card, direction) {
  return direction === 'es-de'
    ? { prompt: card.es, answers: card.de, answerLang: 'de' }
    : { prompt: card.de, answers: card.es, answerLang: 'es' };
}

// Bewertung einer Antwort: "perfekt" (exakt richtig), "okay" (fast richtig oder
// „Ich lag doch richtig“) oder "falsch". Für die Gruppen zählt der erste Versuch.
export const GRADES = ['perfekt', 'okay', 'falsch'];

export function createQuiz(cards, random = Math.random) {
  return {
    cards: [...cards],
    queue: shuffle(cards, random),
    retry: [],
    firstGrade: new Map(),
    wrongCount: new Map(),
    round: 1,
  };
}

export function currentCard(quiz) {
  return quiz.queue[0] ?? null;
}

export function answer(quiz, grade, random = Math.random) {
  if (!GRADES.includes(grade)) throw new Error(`Unbekannte Bewertung: ${grade}`);
  const card = quiz.queue.shift();
  if (!card) return;
  if (!quiz.firstGrade.has(card.id)) quiz.firstGrade.set(card.id, grade);
  if (grade === 'falsch') {
    quiz.wrongCount.set(card.id, (quiz.wrongCount.get(card.id) ?? 0) + 1);
    quiz.retry.push(card);
  }
  if (quiz.queue.length === 0 && quiz.retry.length > 0) {
    quiz.queue = shuffle(quiz.retry, random);
    quiz.retry = [];
    quiz.round += 1;
  }
}

export function isFinished(quiz) {
  return quiz.queue.length === 0;
}

export function remaining(quiz) {
  return quiz.queue.length + quiz.retry.length;
}

export function firstTryCorrect(quiz) {
  return [...quiz.firstGrade.values()].filter((g) => g !== 'falsch').length;
}

// Karten nach dem ersten Versuch gruppiert. "falsch" ist nach Anzahl der Fehlversuche
// sortiert (die schwersten zuerst); Karten ohne Antwort tauchen nicht auf.
export function groupCards(quiz) {
  const groups = { falsch: [], okay: [], perfekt: [] };
  for (const card of quiz.cards) {
    const grade = quiz.firstGrade.get(card.id);
    if (grade) groups[grade].push({ card, wrong: quiz.wrongCount.get(card.id) ?? 0 });
  }
  groups.falsch.sort((a, b) => b.wrong - a.wrong);
  return groups;
}
