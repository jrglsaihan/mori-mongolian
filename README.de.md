# Mori — Mongolische Schrift

Ein Editor für Dokumente mit vertikalem Satz für die traditionelle mongolische Schrift (macOS-Vorschau).

[English](README.md) · [简体中文](README.zh-CN.md) · [Монгол](README.mn.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Deutsch** · [Français](README.fr.md) · [Español](README.es.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-b9ce9c.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%2013%2B-b9ce9c.svg)](#build)

Die traditionelle mongolische Schrift läuft **von oben nach unten, die Spalten von links nach rechts**.
Die Oberfläche ist deshalb im Querformat gehalten: Die Seite breitet sich horizontal aus, während der
Text vertikal wächst.

![Mori unter macOS](docs/preview.png)

> **Status: lauffähige Entwicklungsvorschau (v0.2.0).**
> Bearbeitung, Systemschriften, Erhalt des Originaltextes und ausdrückliche Kodierungs­umwandlung
> funktionieren. Das Projekt hat jedoch **keine** vollständige Konformitätsprüfung gegen die chinesischen
> Nationalstandards für Mongolisch bestanden, und **keine** Unternehmens-Eingabemethode wurde auf echter
> Hardware verifiziert. Betrachten Sie es nicht als fertigen Word-Ersatz.

---

## Was das ist

Eine vollständig offline arbeitende lokale Mac-App. Kein Netzwerkzugriff, keine Dokumenten-Uploads,
keine Cloud-Dienste, keine mitgelieferten kommerziellen Schriften oder Eingabemethoden.

- **Native Hülle**: Swift + AppKit + WKWebView, Universal-Binary (Apple Silicon / Intel)
- **Editor**: ProseMirror mit `writing-mode: vertical-lr` — echter vertikaler Satz, kein gedrehter horizontaler
- **Umwandlung**: Satsrag/mongol-convert 0.7.1 WASM, lokal ausgeführt
- **Ersatzschrift**: Noto Sans Mongolian (SIL OFL 1.1)

## Umgesetzt

### Bearbeitung und Satz
- Vertikaler Rich-Text: oben → unten, Spalten links → rechts; durchlaufende horizontale Arbeitsfläche mit Zoom
- Überschriften / Fließtext / Aufzählungen; fett, kursiv, unterstrichen, Textfarbe
- Rückgängig / Wiederholen, Suchen und Alles ersetzen
- Schrift, Größe, Zeilenhöhe, Ausrichtung, Ränder und Satzspiegelhilfen auf Dokumentebene
- Palette für Steuerzeichen: FVS (U+180B–180D), MVS (U+180E), NNBSP (U+202F), ZWJ / ZWNJ, mongolische Satzzeichen
- Live-Anzeige der Codepunkte der Auswahl (U+XXXX) sowie Zeichen-, Wort- und PUA-Zählung

### macOS-spezifische Funktionen
- AppKit-Menüleiste, native Öffnen- und Sichern-Dialoge, Hinweis bei ungesicherten Änderungen
- **Listet alle installierten Schriften auf** und prüft die Abdeckung mongolischer Codepunkte, sodass installierte mongolische Schriften direkt wählbar sind
- Hängt sich in den Kompositions-Lebenszyklus der System-Eingabemethode ein und **verändert das Dokument nie während der Komposition**
- Speichert Dokumente als `.mglx` mit Rich-Text, Schrifteinstellungen und den ursprünglich importierten Bytes
- TXT-/HTML-Export, Systemdruck und „Als PDF sichern“

## Was die drei Kodierungsprofile tatsächlich leisten

Die drei Optionen aus dem ursprünglichen Screenshot entsprechen unterschiedlichen **Konventionen für
Glyphen und Steuerzeichen** — es sind keine Unicode-Versionsnummern:

| Profil | Verhalten in dieser Version | Noch nicht umgesetzt |
| --- | --- | --- |
| Mongolisch (Nationalstandard 2023) | Bearbeitung des Unicode-Originals, FVS / MVS bleiben erhalten, Formung durch die gewählte Schrift | Vollständige Konformität mit GB/T 25914-2023 |
| Mongolisch (Nationalstandard 2010) | Alte Konventionen bleiben wörtlich erhalten; Buchstaben, Variantenselektoren und Suffixtrenner werden nicht umgeschrieben | Automatische Migration 2010 ↔ 2023 |
| Mongolisch (Menksoft-Kodierung) | Bearbeitung des Originals im Private-Use-Bereich; Vorschau der Umwandlung MenkShape / MenkLetter und Export einer Kopie | Vollständige PUA-Schriftzuordnungen, garantierte verlustfreie Rundläufe |

**Das Umschalten des Profils ändert nur die Dokumentmetadaten und schreibt niemals Codepunkte im Text um.**
Das ist Absicht: Die automatische Migration ist ungeprüft, und stillschweigende Umwandlung beschädigt Text.

Zur Bezeichnung `International 2010` / `International 2023`: Wahrscheinlich sind damit die Glyphen­konventionen
der beiden Nationalstandards GB/T 25914-2010 und GB/T 25914-2023 gemeint (die Ausgabe 2023 ersetzt die
Ausgabe 2010), nicht Unicode-Versionen. Wie ein bestimmter Hersteller dies umsetzt, wurde hier nicht geprüft.

### Wo GB18030 einzuordnen ist

GB18030 ist eine **Byte-Kodierungsebene für Dateien**. Sie ist ein separates Thema von mongolischen
Nominalzeichen, Glyphenkonventionen und Schriftformung. Beim Import wird der System-Decoder verwendet;
exportierter Text ist immer UTF-8.

## Sicherheit bei der Umwandlung

Gemessenes Ergebnis: Nach einem Rundlauf durch die aktuelle Open-Source-Engine kommt das Beispielwort
`ᠮᠣᠩᠭᠣᠯ` **nicht mit identischen Nominalbuchstaben** zurück. Deshalb:

- Die Umwandlung **erzeugt nur eine Vorschau und eine Kopie** — sie ersetzt nie den Dokumentinhalt
- Jede Umwandlung führt automatisch eine Rundlaufprüfung durch und warnt ausdrücklich bei Fehlschlag
- Keine Engine-Warnung und keine optische Glyphenähnlichkeit beweist Verlustfreiheit

> Die Umwandlung mongolischer Kodierungen bringt durch die Glyphennormalisierung zwangsläufig
> Informationsverluste mit sich. **Überschreiben Sie niemals Ihr einziges Original mit einem Umwandlungsergebnis.**

## Build

Erfordert macOS, Apple Command Line Tools und Node.js 22+.

```bash
npm install
npm run build:web        # erzeugt web/ (in .gitignore)
```

Das Build-Skript der nativen App schreibt standardmäßig nach `outputs/` neben dem Projektverzeichnis:

```bash
mkdir -p ../outputs
npm run build:mac        # kompiliert arm64 + x86_64 und packt ../outputs/Mori.app
```

Tests:

```bash
npm test                 # 21 Tests zu Kodierung und Dokumentintegrität
```

Optionaler nativer Selbsttest (schreibt Bericht und Screenshot):

```bash
../outputs/Mori.app/Contents/MacOS/Mori \
  --smoke-test tests/native-results.json \
  --snapshot docs/preview.png
```

### Neu in v0.2

- **Schrift und Größe auf Auswahlsebene** — die Schrift- und Größenauswahl ändert jetzt den markierten Text; ohne Auswahl wird der Dokumentstandard geändert. Ein Badge zeigt den aktiven Bereich.
- **Absatz- und Zeichenformatierung** — Überschriften H1–H3 (⌘0–⌘3), Absatzeinzug, Erstzeileneinzug, Absatzzeilenhöhe, vier Ausrichtungen, hoch- und tiefgestellt.
- **Seiteneinrichtung und Seitenumbruch** — A4/A3, Quer-/Hochformat, Randvorgaben, schreibgeschützte Umbruchvorschau und paginiertes PDF. Der Umbruch wird durch Messen jedes Blocks berechnet, daher belegen größere Überschriften entsprechend mehr Platz.
- **DOCX-Import und -Export** über ein lokal installiertes LibreOffice, aufgerufen als **separater Prozess**. Es wird nichts gelinkt oder mitgeliefert, die GPL-3.0-Pflichten von LibreOffice reichen daher nicht auf dieses MIT-Projekt durch. `MORI_SOFFICE` legt einen abweichenden Pfad fest.

## Prüfergebnisse

| Punkt | Ergebnis |
| --- | --- |
| Kerntests | 49 / 49 bestanden |
| Prüfungen des nativen Editors | 56 / 56 bestanden |
| Aufgelistete Schriftschnitte | 557 |
| Schriften mit Abdeckung der mongolischen Beispiel-Codepunkte | 44 |
| Schriften mit Abdeckung der geprüften PUA-Codepunkte | 47 |

Abgedeckt sind: Erhalt von Unicode-Steuerzeichen, UTF-8 / UTF-16, GB18030-Beispiele, Ablehnung
ungültiger Eingaben, Dokumentserialisierung und Versionsprüfung, Codepunkt-Statistik, Warnungen bei
nicht verlustfreien Rundläufen, Rückgängig / Wiederholen, Suche über Inline-Formatierung hinweg, Schutz
der Bestätigungstaste der Eingabemethode, Auflistung nativer Schriften und das Zurücklesen einer
isolierten Sicherungskopie.

**Dies sind keine Standardzertifizierungen und keine Eingabemethoden-Zertifizierungen.** Siehe
[`tests/native-results.json`](tests/native-results.json) und [`tests/core-results.json`](tests/core-results.json).

## Bekannte Einschränkungen

- **Eingabemethoden**: Der Standard-Kompositionshaken ist umgesetzt, aber Menksoft und die verschiedenen
  Unternehmens-Eingabemethoden für Mongolisch müssen je Hersteller und Version auf echter Hardware geprüft
  werden. Windows-Eingabemethoden laufen nicht allein deshalb unter macOS, weil ein Kodierungsadapter
  ergänzt wurde.
- **Word-Funktionen**: Keine Tabellen, Bilder, Kopf-/Fußzeilen, Seitenzahlen, Fußnoten, Änderungsverfolgung oder Kommentare; der Seitenumbruch ist eine schreibgeschützte Vorschau, keine Bearbeitung direkt auf der Seite.
- **Seitenumbruch und PDF**: Blockweise gemessener Umbruch und paginierte PDF-Ausgabe sind umgesetzt. Ein Absatz, der länger als eine Seite ist, wird nicht geteilt, sondern erhält eine eigene Seite mit Hinweis auf mögliches Abschneiden. Die Glyphentreue im PDF ist weiterhin ungeprüft.
- **Zeichensatzumfang**: Die vollständige Umwandlung für Todo, Sibe und Mandschu liegt außerhalb des geprüften Bereichs.
- **Sicherungskopie**: Es wird nur der letzte Arbeitsbereich aufbewahrt
  (`~/Library/Application Support/Mori/draft.mglx`), keine Versionshistorie.
- **Plattformprüfung**: Nur auf Apple Silicon real getestet; Intel und ältere macOS-Versionen sind ungeprüft.
- **Signatur**: Lokale Ad-hoc-Signatur, **keine Apple-Developer-ID-Signatur und keine Notarisierung**;
  beim ersten Start auf einem anderen Mac kann daher ein Sicherheitshinweis erscheinen.

## Repository-Struktur

```
src/        Editor (HTML / CSS / ProseMirror-Logik / Kodierungskern)
native/     native Swift-Hülle, Info.plist, Build-Skript
vendor/     Offline-Umwandlungsengine (WASM) und Ersatzschrift
tests/      automatisierte Tests und Ergebnisnachweise
docs/       Screenshot und Versionshinweise
LICENSE     vollständiger MIT-Lizenztext
THIRD-PARTY-NOTICES.md  Lizenzen Dritter und Grenzen der Schriftrechte
build.cjs   Skript zum Bündeln der Web-Oberfläche
```

## Komponenten Dritter

| Komponente | Lizenz | Hinweis |
| --- | --- | --- |
| [ProseMirror](https://github.com/ProseMirror/prosemirror-view) | MIT | Engine zur Rich-Text-Bearbeitung |
| [Satsrag/mongol-convert 0.7.1](https://github.com/Satsrag/mongol-convert/tree/v0.7.1) | Apache-2.0 | Lokale WASM-Kodierungsumwandlung, einschließlich mongol-norm-Normalisierungsbackend |
| [Noto Sans Mongolian](https://github.com/google/fonts/tree/main/ofl/notosansmongolian) | SIL OFL 1.1 | Ersatzschrift |

Vollständige Lizenztexte liegen in [`vendor/`](vendor) und [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
Beim Build wird `web/THIRD-PARTY-NOTICES.txt` automatisch erzeugt.

**Kommerzielle Schriften (etwa eine installierte Familie Menk / Menksoft) werden weder kopiert noch
mitgeliefert** — das System lädt sie zur Laufzeit über ihren Namen.

### Normative Quellen

- [GB/T 25914-2023](https://std.samr.gov.cn/gb/search/gbDetailed?id=0B4529DE108FFCAFE06397BE0A0A46CC) — Nominalzeichen, Präsentationsformen und Verwendung der Steuerzeichen der traditionellen mongolischen Schrift; ersetzt die Ausgabe 2010
- [Unicode-FAQ zum Private-Use-Bereich](https://www.unicode.org/faq/private_use.html)
- [Unicode Standard §13.5](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-13/) — Mongolisch, einschließlich der Entwicklung von U+180E und U+202F

## Lizenz

Der eigene Code dieses Projekts steht unter der **MIT-Lizenz**; der vollständige Text findet sich in
[`LICENSE`](LICENSE).

Das bedeutet, Sie dürfen diesen Code frei verwenden, verändern, verbreiten und kommerziell nutzen, sofern
Sie den Urheberrechts- und Lizenzhinweis beibehalten. Komponenten Dritter unter `vendor/` behalten ihre
eigenen Lizenzen (MIT / Apache-2.0 / OFL 1.1) — siehe [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Beachtenswerte Grenzen:

- **Kommerzielle mongolische Schriften werden hier nicht verbreitet.** Installierte Schriften wie Menk /
  Menksoft werden zur Laufzeit vom System über ihren Namen geladen; ihre Lizenzierung ist eine Sache
  zwischen Ihnen und dem Schrifthersteller, und dieses Projekt räumt keinerlei Schriftrechte ein.
- Das Projekt besitzt **keine Konformitätszertifizierung**, und MIT gewährt keine Gewährleistung. Prüfen
  Sie Glyphenformung und Seitenumbruch selbst, bevor Sie veröffentlichen oder kommerziell setzen.

## Fahrplan

- [ ] Migration der Glyphenkonventionen 2010 ↔ 2023 mit Regressionstests
- [ ] Vollständige Konformitätsprüfung gegen GB/T 25914-2023
- [ ] Realhardware-Prüfung für konkrete Unternehmens-Eingabemethoden
- [x] Automatischer Seitenumbruch und Glyphentreue im PDF
- [x] DOCX-Import und -Export
- [ ] Versionshistorie für Dokumente

## Mitwirken

Wenn dieses Projekt Ihnen nützt, ist der wertvollste Beitrag **echte Testdaten**: Namen und Versionen der
von Ihnen genutzten Eingabemethoden sowie 3–5 öffentlich teilbare kleine Beispieldateien je Kodierung.
Probleme mit der Kodierungskompatibilität lassen sich nur mit echten Daten abschließen.
