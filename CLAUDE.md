# Vokabel-Lern-Webseite Spanisch (Deutsch ↔ Spanisch)

## Ziel
Einfache, schnelle Karteikarten-App. Ich lerne mit einem Schulbuch, das in Kapitel unterteilt ist. Pro Kapitel gibt es einen Stapel, und ich lasse mich abfragen. Bewusst kein Overengineering.

## Technik
- Reines HTML, CSS, JavaScript (ES-Module), kein Framework, kein Build-Schritt, keine Abhängigkeiten.
- Kein Backend. Die Kapitel liegen als Textdateien im Projekt (decks/), Lernfortschritt und eigene Stapel in localStorage.
- localStorage-Daten mit Versionsnummer im Schema, damit spätere Änderungen sauber migriert werden können.
- Später als PWA (offline nutzbar, zum Homescreen hinzufügbar), gehostet auf GitHub Pages.
- Mobile first: Muss am Handy gut bedienbar sein.
- Lokales Testen über einen einfachen Server (z. B. python3 -m http.server oder npx serve), weil fetch über file:// nicht funktioniert.

## Struktur
- index.html, styles.css
- src/parser.js: Import-Text in Karten umwandeln (reine Funktion, kein DOM)
- src/check.js: Antwort prüfen (reine Funktion, kein DOM)
- src/storage.js: Laden, Speichern, Export, Import, Validierung
- src/decks.js: Stapel und Karten anlegen/ändern/löschen, Vorschau-Text, mitgelieferte Kapitel laden (kein DOM)
- src/quiz.js: Ablauf einer Abfrage-Runde (kein DOM)
- src/app.js: Oberfläche
- decks/: Kapitel-Dateien plus decks/index.json
- sw.js, manifest.webmanifest, icon.svg, icon-192.png, icon-512.png: PWA
- tests/: Tests mit dem eingebauten Node-Testrunner (node --test), ohne externe Pakete
- package.json: nur `"type": "module"` und das Test-Skript, keine Abhängigkeiten

## Funktionen
1. Stapel: eigene Stapel anlegen, umbenennen, löschen (Bestätigung in der Oberfläche, kein confirm()), Karten ansehen, bearbeiten und löschen.
2. Schnelles Einfügen: Großes Textfeld, eine Karte pro Zeile im Format
   `spanisch ; deutsch ; notiz(optional)`
   - Mehrere richtige Antworten pro Seite mit `/` getrennt, z. B. `el coche / el carro ; das Auto`
   - Leere Zeilen und Zeilen mit # ignorieren
   - Leerzeichen trimmen, Windows- und Unix-Zeilenumbrüche unterstützen
   - Fehlerhafte Zeilen (kein Semikolon, leere Seite) NICHT stillschweigend verwerfen, sondern mit Zeilennummer anzeigen
   - Vorschau vor dem Speichern: "23 Karten erkannt, 1 Fehler in Zeile 7"
   - Doppelte Karten im selben Stapel erkennen und überspringen
3. Mitgelieferte Stapel:
   - Im Ordner decks/ liegen Textdateien im gleichen Format (eine pro Kapitel).
   - decks/index.json listet sie mit Anzeigenamen, z. B. [{"file": "kapitel-01.txt", "name": "Kapitel 1 – Saludos"}].
   - Die App lädt sie per fetch beim Start. In der App sind sie schreibgeschützt, die Datei ist die Quelle der Wahrheit.
   - Lernfortschritt pro Karte über eine stabile ID (Stapel-ID + normalisierte spanische Seite), damit er nach Änderungen an der Datei erhalten bleibt.
   - Kann eine Datei nicht geladen werden, zeigt die App einen klaren Hinweis statt abzustürzen.
   - parser.js wird für Einfügen und Dateien verwendet, kein doppelter Code.
4. Abfrage:
   - Richtung wählbar: Deutsch → Spanisch oder Spanisch → Deutsch
   - Reihenfolge zufällig
   - Antwort eintippen, Enter prüft, nochmal Enter geht zur nächsten Karte
   - Falsch beantwortete Karten kommen am Ende der Runde erneut, bis alle richtig sind
   - Am Ende: Zusammenfassung (wie viele beim ersten Versuch richtig)
   - Button "Ich lag doch richtig", falls die Prüfung zu streng war
   - Notiz der Karte wird nach dem Antworten angezeigt
5. Antwortprüfung (check.js), Ergebnis ist "richtig", "fast richtig" oder "falsch":
   - Vergleich ohne Groß-/Kleinschreibung, mit getrimmten und zusammengefassten Leerzeichen
   - Satzzeichen wie ¿ ¡ ? ! . , am Anfang und Ende ignorieren
   - Stimmt die Antwort nur ohne Akzente/Tilde überein (cafe statt café, nino statt niño), zählt sie als RICHTIG, mit Hinweis auf die korrekte Schreibweise ("fast richtig")
   - Jede der mit / getrennten Varianten wird akzeptiert
   - Normalisierung über Unicode NFD und Entfernen der kombinierenden Zeichen
6. Backup: Export aller localStorage-Daten als JSON-Datei und Import. Import wird vorher validiert, eine kaputte Datei darf keine bestehenden Daten zerstören.

## Qualitätsregeln
- Logik (Parser, Prüfung, Speicher-Validierung) strikt getrennt von der Oberfläche.
- Jede Logikfunktion hat Tests, auch für Randfälle (leere Eingabe, \r\n, mehrere Semikolons, nur Leerzeichen, ñ ü ¿ ¡, Varianten mit /).
- Alle localStorage-Zugriffe in try/catch. Die App funktioniert auch, wenn der Speicher leer oder kaputt ist.
- Benutzertexte nie per innerHTML einsetzen, immer textContent.
- Nach jeder Änderung node --test ausführen, alles muss grün sein.
- Kleine, überschaubare Dateien, keine unnötigen Abstraktionen.
- Oberfläche auf Deutsch.

## Befehle
- Tests: `node --test` (oder `npm test`)
- Lokaler Server: `python -m http.server 8000` oder `npx serve`, dann http://localhost:8000

## Festgelegte Details (aus Schritt 1)
- `parseCards(text)` → `{ cards, errors, duplicates }`, Karte = `{ es: string[], de: string[], note }`.
- Mehr als zwei Semikolons: alles nach dem zweiten gehört zur Notiz.
- `cardKey(es)` = normalisierte spanische Varianten, mit `/` verbunden, Akzente bleiben erhalten (año ≠ ano). Stabile Karten-ID = Stapel-ID + cardKey. Duplikat = gleicher cardKey.
- `checkAnswer(input, variants)` → `{ result: "richtig" | "fast richtig" | "falsch", expected }`.

## Festgelegte Details (aus Schritt 2)
- Ein localStorage-Schlüssel `vokabeln`, Schema-Version 1:
  `{ version, decks: [{ id, name, cards }], progress: { [cardId]: { correct, wrong } }, settings: { direction: "de-es" | "es-de" } }`
- `decks` enthält nur eigene Stapel. Mitgelieferte Stapel kommen aus decks/, nur ihr Fortschritt liegt im Speicher.
- `cardId(deckId, es)` = `${deckId}:${cardKey(es)}`. Mitgelieferte Stapel: `datei:<dateiname>`, eigene: `eigen-<uuid>`.
- Der Speicher wird an `load`/`save` übergeben (Standard: localStorage), Tests nutzen einen Fake-Speicher.
- Kaputte gespeicherte Daten: App startet leer mit Warnung, der Rohtext wird einmalig unter `vokabeln-kaputt` gesichert.
- `importJSON` schreibt nie, die App ruft `save` nur bei `ok` auf.
- Neue Schema-Version: `SCHEMA_VERSION` erhöhen und in `MIGRATIONS[alteVersion]` eine Funktion alt → neu ergänzen, mit Test.

## Festgelegte Details (aus Schritt 3)
- Duplikat und Karten-ID hängen an der ganzen spanischen Seite inkl. aller Varianten: `el coche` und `el coche / el carro` sind zwei verschiedene Karten.
- Karten bearbeiten: eine Zeile im Einfügeformat (`cardToLine` ↔ `parseCards`). Ändert sich die spanische Seite, zieht der Fortschritt zur neuen ID um.
- Fortschritt wird beim Weitergehen zur nächsten Karte gezählt, damit „Ich lag doch richtig“ das Ergebnis vorher noch ändern kann.
- Nach dem Speichern eingefügter Karten bleiben nur die fehlerhaften Zeilen im Textfeld stehen.
- Service Worker: Netzwerk zuerst, Cache als Rückfall. Bei neuen Dateien in src/ die Liste `SHELL` in sw.js ergänzen; `CACHE` hochzählen, wenn alte Caches sicher weg sollen.
- Neues Kapitel: Datei in decks/ ablegen und in decks/index.json eintragen.
- Auswertung am Ende einer Abfrage (nur für diese Sitzung, nicht gespeichert): Der erste Versuch pro Karte bestimmt die Gruppe. Gruppe 1 „Wiederholen“ = falsch (sortiert nach Anzahl Fehlversuche), Gruppe 2 „Okay“ = fast richtig oder „Ich lag doch richtig“, Gruppe 3 „Perfekt“ = exakt richtig. `answer(quiz, grade)` mit grade `"perfekt" | "okay" | "falsch"`, `groupCards(quiz)` liefert die Gruppen. „Beenden“ mitten in der Abfrage zeigt die Auswertung der bisher beantworteten Karten; „Gruppe 1 üben“ startet eine Abfrage nur mit diesen Karten.

## Veröffentlichen (GitHub Pages)
Repository anlegen, alle Dateien pushen, unter Settings → Pages „Deploy from a branch“, Branch `main`, Ordner `/ (root)`. Alle Pfade sind relativ, die App läuft also auch unter `https://<name>.github.io/<repo>/`.

## Stand
- [x] Schritt 1: CLAUDE.md, src/parser.js, src/check.js, Tests
- [x] Schritt 2: src/storage.js, Tests
- [x] Schritt 3: Oberfläche, decks.js, quiz.js, mitgelieferte Kapitel, PWA
