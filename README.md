# Mori — Mongolian Writing

A vertical-layout document editor for Traditional Mongolian (macOS preview).

**English** · [简体中文](README.zh-CN.md) · [Монгол](README.mn.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-b9ce9c.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%2013%2B-b9ce9c.svg)](#build)

Traditional Mongolian runs **top to bottom, with columns advancing left to right**. The interface is therefore landscape: the page spreads horizontally while the text grows vertically.

![Mori running on macOS](docs/preview.png)

> **Status: runnable development preview (v0.2.0).**
> Editing, system fonts, source-text preservation and explicit encoding conversion work today. It has **not** passed full conformance testing against the Chinese national standards for Mongolian, and **no** enterprise input method has been verified on a real machine. Do not treat it as a finished Word replacement.

---

## What this is

A fully offline local Mac app. No network access, no document uploads, no cloud services, no bundled commercial fonts or input methods.

- **Native shell**: Swift + AppKit + WKWebView, universal binary (Apple Silicon / Intel)
- **Editor**: ProseMirror with `writing-mode: vertical-lr` — genuine vertical layout, not a rotated horizontal one
- **Conversion**: Satsrag/mongol-convert 0.7.1 WASM, running locally
- **Fallback font**: Noto Sans Mongolian (SIL OFL 1.1)

## Implemented

### Editing and layout
- Vertical rich text: top → bottom, columns left → right; continuous horizontal canvas with zoom
- Headings / body text / bullet lists; bold, italic, underline, text colour
- Undo / redo, find and replace-all
- Document-level font, size, line height, alignment, margins and text-area guides
- Control-character palette: FVS (U+180B–180D), MVS (U+180E), NNBSP (U+202F), ZWJ / ZWNJ, Mongolian punctuation
- Live code-point readout for the selection (U+XXXX), plus character / word / private-use counts

### macOS-native capabilities
- AppKit menu bar, native open and save panels, unsaved-changes prompt on quit
- **Enumerates every installed font** and checks Mongolian code-point coverage, so installed Mongolian fonts are directly selectable
- Hooks into the system input method composition lifecycle and **never mutates the document mid-composition**
- Saves documents as `.mglx`, preserving rich text, font settings and the original imported bytes
- TXT / HTML export, system printing and Save-as-PDF

## What the three encoding profiles actually support

The three options in the original screenshot correspond to different **glyph and control conventions** — they are not Unicode version numbers:

| Profile | Behaviour in this version | Not yet done |
| --- | --- | --- |
| Mongolian (National Standard 2023) | Unicode source editing, FVS / MVS preserved, shaped by the selected font | Full GB/T 25914-2023 conformance |
| Mongolian (National Standard 2010) | Legacy conventions preserved verbatim; letters, variant selectors and suffix separators are not rewritten | Automatic 2010 ↔ 2023 convention migration |
| Mongolian (Menksoft encoding) | Private-use source editing; MenkShape / MenkLetter conversion preview and copy export | Complete PUA font mappings, guaranteed lossless round-trips |

**Switching the profile only changes document metadata; it never rewrites code points in the text.** That is deliberate — automatic migration is unverified, and silent conversion corrupts text.

On the `International 2010` / `International 2023` naming: these most likely refer to the glyph conventions of GB/T 25914-2010 and GB/T 25914-2023 (the 2023 edition supersedes the 2010 one), not to Unicode versions. This project has not verified how any particular vendor implements them.

### Where GB18030 fits

GB18030 is a **file byte-encoding layer**. It is a separate concern from Mongolian nominal characters, glyph conventions and font shaping. Import uses the system decoder; exported text is always UTF-8.

## Conversion safety

Measured result: after a round trip through the current open-source engine, the sample word `ᠮᠣᠩᠭᠣᠯ` does **not** come back with identical nominal letters. Therefore:

- Conversion **only produces a preview and a copy** — it never replaces the document body
- Every conversion runs an automatic round-trip check and warns explicitly on failure
- No engine warning and no visual glyph similarity proves the text is lossless

> Mongolian encoding conversion involves inherent information loss through glyph normalisation. **Never overwrite your only original with a conversion result.**

## Build

Requires macOS, Apple Command Line Tools and Node.js 22+.

```bash
npm install
npm run build:web        # generates web/ (gitignored)
```

The native build script writes to `outputs/` next to the project directory:

```bash
mkdir -p ../outputs
npm run build:mac        # compiles arm64 + x86_64 and packages ../outputs/Mori.app
```

Tests:

```bash
npm test                 # 49 encoding, layout and document-integrity tests
```

Optional native self-check (writes a report and a screenshot):

```bash
../outputs/Mori.app/Contents/MacOS/Mori \
  --smoke-test tests/native-results.json \
  --snapshot docs/preview.png
```

### Added in v0.2

- **Selection-level font and size** — the font and size controls now restyle the selected text; with no selection they change the document default. A badge shows which scope is active.
- **Paragraph and character formatting** — headings H1–H3 (⌘0–⌘3), paragraph indent, first-line indent, per-paragraph line height, four alignments, superscript and subscript (⌘. / ⌘,).
- **Page setup and pagination** — A4/A3, landscape/portrait, margin presets, a paginated read-only preview and paginated PDF output. Pagination is computed by measuring every block, so headings with larger type consume proportionally more of the page.
- **DOCX import and export** through a locally installed LibreOffice, invoked as a **separate process**. Nothing is linked or bundled, so LibreOffice's GPL-3.0 obligations do not extend to this MIT-licensed project. Set `MORI_SOFFICE` to use a non-standard install path.

## Verification results

| Item | Result |
| --- | --- |
| Core tests | 49 / 49 passed |
| Native editor checks | 56 / 56 passed |
| Installed font faces enumerated | 557 |
| Fonts covering Mongolian sample code points | 44 |
| Fonts covering tested private-use code points | 47 |

Coverage includes: Unicode control-character fidelity, UTF-8 / UTF-16, GB18030 samples, rejection of invalid input, document serialisation and version validation, code-point statistics, conversion round-trip warnings, undo / redo, search across inline formatting, input-method confirmation-key protection, native font enumeration and isolated recovery-copy read-back.

**These are not standards certifications, nor input-method certifications.** See [`tests/native-results.json`](tests/native-results.json) and [`tests/core-results.json`](tests/core-results.json).

## Known limitations

- **Input methods**: the standard composition hook is implemented, but Menksoft and the various enterprise Mongolian input methods still need per-vendor, per-version verification on real hardware. Windows input methods will not run on macOS just because an encoding adapter was added.
- **Word features**: no tables, images, headers/footers, page-number fields, footnotes, track changes or comments; pagination is a read-only preview, not in-page editing.
- **Pagination and PDF**: block-measured pagination and paginated PDF output are implemented. A paragraph longer than one page is not split — it gets its own page with a truncation warning. Per-glyph PDF fidelity is still unverified; check the print preview.
- **Character-set scope**: full conversion for Todo, Sibe and Manchu is outside the verified range.
- **Recovery copy**: keeps only the most recent workspace (`~/Library/Application Support/Mori/draft.mglx`); it is not version history.
- **Platform verification**: tested on Apple Silicon only; Intel and older macOS are unverified.
- **Signing**: ad-hoc local signature, **no Apple Developer ID signing or notarisation**, so first launch on another Mac may raise a security prompt.

## Repository layout

```
src/        editor (HTML / CSS / ProseMirror logic / encoding core)
native/     Swift shell, Info.plist, build script
vendor/     offline conversion engine (WASM) and fallback font
tests/      automated tests and result evidence
docs/       screenshot and release notes
LICENSE     full MIT text
THIRD-PARTY-NOTICES.md  third-party licences and font licensing boundaries
build.cjs   web bundling script
```

## Third-party components

| Component | Licence | Notes |
| --- | --- | --- |
| [ProseMirror](https://github.com/ProseMirror/prosemirror-view) | MIT | Rich-text editing engine |
| [Satsrag/mongol-convert 0.7.1](https://github.com/Satsrag/mongol-convert/tree/v0.7.1) | Apache-2.0 | Local WASM encoding conversion, including the mongol-norm normalisation backend |
| [Noto Sans Mongolian](https://github.com/google/fonts/tree/main/ofl/notosansmongolian) | SIL OFL 1.1 | Fallback font |

Full licence texts live in [`vendor/`](vendor) and [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). The build generates `web/THIRD-PARTY-NOTICES.txt` automatically.

**Commercial fonts (such as an installed Menk / Menksoft family) are never copied or bundled** — the system loads them by name at runtime.

### Standards references

- [GB/T 25914-2023](https://std.samr.gov.cn/gb/search/gbDetailed?id=0B4529DE108FFCAFE06397BE0A0A46CC) — nominal characters, presentation forms and control-character usage for Traditional Mongolian; supersedes the 2010 edition
- [Unicode private-use area FAQ](https://www.unicode.org/faq/private_use.html)
- [Unicode Standard §13.5](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-13/) — Mongolian, including the evolution of U+180E and U+202F

## Licence

Original code in this project is released under the **MIT Licence**; see [`LICENSE`](LICENSE) for the full text.

That means you may freely use, modify, distribute and commercialise this code, provided you keep the copyright and licence notice. Third-party components under `vendor/` keep their own licences (MIT / Apache-2.0 / OFL 1.1) — see [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Boundaries worth noting:

- **Commercial Mongolian fonts are not distributed here.** Installed Menk / Menksoft fonts are loaded by name at runtime; their licensing is between you and the font vendor, and this project grants no font rights.
- This project has **no standards-conformance certification** and MIT carries no warranty. Verify glyph shaping and pagination yourself before publishing or commercial typesetting.

## Roadmap

- [ ] 2010 ↔ 2023 glyph-convention migration with regression cases
- [ ] Full GB/T 25914-2023 conformance verification
- [ ] Real-hardware verification for specific enterprise input methods
- [x] Automatic pagination and PDF glyph fidelity
- [x] DOCX import and export
- [ ] Multi-version document history

## Contributing

If this project is useful to you, the most valuable contribution is **real test data**: the names and versions of the input methods you use, plus 3–5 shareable sample files per encoding. Encoding-compatibility problems can only be closed out with real data.
