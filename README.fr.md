# Mori — écriture mongole

Un éditeur de documents à composition verticale pour l'écriture mongole traditionnelle (aperçu macOS).

[English](README.md) · [简体中文](README.zh-CN.md) · [Монгол](README.mn.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · **Français** · [Español](README.es.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-b9ce9c.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%2013%2B-b9ce9c.svg)](#compilation)

L'écriture mongole traditionnelle se lit **de haut en bas, les colonnes allant de gauche à droite**.
L'interface est donc en format paysage : la page s'étend horizontalement tandis que le texte croît
verticalement.

![Mori sous macOS](docs/preview.png)

> **État : aperçu de développement fonctionnel (v0.1.0).**
> L'édition, les polices système, la préservation du texte d'origine et la conversion explicite
> d'encodage fonctionnent. En revanche, le projet **n'a pas** passé la vérification de conformité
> complète aux normes nationales chinoises pour le mongol, et **aucune** méthode de saisie
> professionnelle n'a été validée sur machine réelle. Ne le considérez pas comme un remplacement
> achevé de Word.

---

## De quoi s'agit-il

Une application Mac locale entièrement hors ligne. Aucun accès réseau, aucun envoi de document, aucun
service cloud, aucune police ni méthode de saisie commerciale embarquée.

- **Enveloppe native** : Swift + AppKit + WKWebView, binaire universel (Apple Silicon / Intel)
- **Éditeur** : ProseMirror avec `writing-mode: vertical-lr` — véritable composition verticale, pas une composition horizontale pivotée
- **Conversion** : Satsrag/mongol-convert 0.7.1 WASM, exécuté localement
- **Police de repli** : Noto Sans Mongolian (SIL OFL 1.1)

## Ce qui est implémenté

### Édition et composition
- Texte enrichi vertical : haut → bas, colonnes gauche → droite ; plan de travail horizontal continu, avec zoom
- Titres / corps de texte / listes à puces ; gras, italique, souligné, couleur du texte
- Annuler / rétablir, rechercher et remplacer tout
- Police, taille, interligne, alignement, marges et repères de mise en page au niveau du document
- Palette de caractères de contrôle : FVS (U+180B–180D), MVS (U+180E), NNBSP (U+202F), ZWJ / ZWNJ, ponctuation mongole
- Affichage en direct des points de code de la sélection (U+XXXX), comptage des caractères, des mots et de la zone à usage privé

### Fonctions propres à macOS
- Barre de menus AppKit, panneaux natifs d'ouverture et d'enregistrement, avertissement en cas de modifications non enregistrées
- **Énumère toutes les polices installées** et vérifie la couverture des points de code mongols ; les polices mongoles installées sont donc directement sélectionnables
- Se branche au cycle de composition de la méthode de saisie système et **ne modifie jamais le document pendant la composition**
- Enregistre les documents au format `.mglx`, en conservant le texte enrichi, les réglages de police et les octets d'origine importés
- Export TXT / HTML, impression système et enregistrement au format PDF

## Ce que permettent réellement les trois profils d'encodage

Les trois options de la capture d'origine correspondent à des **conventions de glyphes et de caractères
de contrôle** différentes — ce ne sont pas des numéros de version d'Unicode :

| Profil | Comportement dans cette version | Pas encore fait |
| --- | --- | --- |
| Mongol (norme nationale 2023) | Édition du texte Unicode d'origine, FVS / MVS conservés, mise en forme par la police choisie | Conformité complète à GB/T 25914-2023 |
| Mongol (norme nationale 2010) | Conventions anciennes conservées telles quelles ; lettres, sélecteurs de variante et séparateurs de suffixe ne sont pas réécrits | Migration automatique 2010 ↔ 2023 |
| Mongol (encodage Menksoft) | Édition du texte d'origine en zone à usage privé ; aperçu de conversion MenkShape / MenkLetter et export d'une copie | Tables de correspondance PUA complètes, aller-retour garanti sans perte |

**Changer de profil ne modifie que les métadonnées du document et ne réécrit jamais les points de code
du texte.** C'est délibéré : la migration automatique n'est pas vérifiée, et une conversion silencieuse
corrompt le texte.

À propos des libellés `International 2010` / `International 2023` : ils désignent très probablement les
conventions de glyphes des deux normes nationales GB/T 25914-2010 et GB/T 25914-2023 (l'édition 2023
remplaçant celle de 2010), et non des versions d'Unicode. La façon dont un éditeur donné les implémente
n'a pas été vérifiée ici.

### Où se situe GB18030

GB18030 est une **couche d'encodage d'octets de fichier**. C'est un sujet distinct des caractères
nominaux mongols, des conventions de glyphes et de la mise en forme par la police. L'import utilise le
décodeur du système ; le texte exporté est toujours en UTF-8.

## Sécurité des conversions

Résultat mesuré : après un aller-retour dans le moteur open source actuel, le mot d'exemple `ᠮᠣᠩᠭᠣᠯ`
ne revient **pas avec des lettres nominales identiques**. Par conséquent :

- La conversion **ne produit qu'un aperçu et une copie** — elle ne remplace jamais le corps du document
- Chaque conversion lance automatiquement une vérification d'aller-retour et avertit clairement en cas d'échec
- L'absence d'avertissement du moteur et une ressemblance visuelle des glyphes ne prouvent pas l'absence de perte

> La conversion d'encodages mongols entraîne une perte d'information inhérente à la normalisation des
> glyphes. **N'écrasez jamais votre original unique avec un résultat de conversion.**

## Compilation

Nécessite macOS, les Apple Command Line Tools et Node.js 22+.

```bash
npm install
npm run build:web        # génère web/ (ignoré par git)
```

Le script de compilation de l'application native écrit par défaut dans `outputs/`, à côté du dossier du projet :

```bash
mkdir -p ../outputs
npm run build:mac        # compile arm64 + x86_64 et produit ../outputs/Mori.app
```

Tests :

```bash
npm test                 # 21 tests d'encodage et d'intégrité des documents
```

Auto-contrôle natif facultatif (écrit un rapport et une capture d'écran) :

```bash
../outputs/Mori.app/Contents/MacOS/Mori \
  --smoke-test tests/native-results.json \
  --snapshot docs/preview.png
```

## Résultats de vérification

| Élément | Résultat |
| --- | --- |
| Tests du cœur | 21 / 21 réussis |
| Contrôles de l'éditeur natif | 28 / 28 réussis |
| Déclinaisons de polices installées énumérées | 557 |
| Polices couvrant les points de code mongols échantillonnés | 44 |
| Polices couvrant les points de code PUA testés | 47 |

La couverture inclut : fidélité des caractères de contrôle Unicode, UTF-8 / UTF-16, échantillons
GB18030, rejet des entrées invalides, sérialisation et validation de version des documents, statistiques
de points de code, avertissements d'aller-retour de conversion, annuler / rétablir, recherche à travers
la mise en forme en ligne, protection de la touche de validation de la méthode de saisie, énumération
des polices natives et relecture d'une copie de récupération isolée.

**Ce ne sont ni des certifications de normes, ni des certifications de méthodes de saisie.** Voir
[`tests/native-results.json`](tests/native-results.json) et [`tests/core-results.json`](tests/core-results.json).

## Limitations connues

- **Méthodes de saisie** : le raccordement à la composition standard est implémenté, mais Menksoft et les
  diverses méthodes de saisie mongoles professionnelles doivent encore être validées sur machine réelle,
  éditeur par éditeur et version par version. Les méthodes de saisie Windows ne fonctionneront pas sur
  macOS simplement parce qu'un adaptateur d'encodage a été ajouté.
- **Fonctions Word** : pas d'échange DOCX, pas de tableaux, pas de suivi des modifications, pas de
  commentaires ; il s'agit actuellement d'un document unique sur un plan horizontal continu.
- **Pagination et PDF** : la pagination automatique des documents longs n'est pas implémentée et la
  fidélité des glyphes en PDF n'est pas vérifiée — contrôlez les coupures dans l'aperçu avant impression.
- **Étendue des jeux de caractères** : la conversion complète pour le todo, le sibe et le mandchou sort du périmètre vérifié.
- **Copie de récupération** : ne conserve que le dernier espace de travail
  (`~/Library/Application Support/Mori/draft.mglx`) ; ce n'est pas un historique de versions.
- **Vérification de plateforme** : testé uniquement sur Apple Silicon ; Intel et les versions anciennes de macOS ne sont pas vérifiés.
- **Signature** : signature locale ad hoc, **sans signature Apple Developer ID ni notarisation**, donc le
  premier lancement sur un autre Mac peut déclencher un avertissement de sécurité.

## Structure du dépôt

```
src/        éditeur (HTML / CSS / logique ProseMirror / cœur d'encodage)
native/     enveloppe Swift native, Info.plist, script de compilation
vendor/     moteur de conversion hors ligne (WASM) et police de repli
tests/      tests automatisés et preuves de résultats
docs/       capture d'écran et notes de version
LICENSE     texte complet de la licence MIT
THIRD-PARTY-NOTICES.md  licences tierces et limites des droits sur les polices
build.cjs   script d'assemblage du web
```

## Composants tiers

| Composant | Licence | Remarque |
| --- | --- | --- |
| [ProseMirror](https://github.com/ProseMirror/prosemirror-view) | MIT | Moteur d'édition de texte enrichi |
| [Satsrag/mongol-convert 0.7.1](https://github.com/Satsrag/mongol-convert/tree/v0.7.1) | Apache-2.0 | Conversion d'encodage WASM locale, avec le moteur de normalisation mongol-norm |
| [Noto Sans Mongolian](https://github.com/google/fonts/tree/main/ofl/notosansmongolian) | SIL OFL 1.1 | Police de repli |

Les textes complets des licences se trouvent dans [`vendor/`](vendor) et [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
La compilation génère automatiquement `web/THIRD-PARTY-NOTICES.txt`.

**Les polices commerciales (par exemple une famille Menk / Menksoft installée) ne sont ni copiées ni
embarquées** — le système les charge par leur nom à l'exécution.

### Références normatives

- [GB/T 25914-2023](https://std.samr.gov.cn/gb/search/gbDetailed?id=0B4529DE108FFCAFE06397BE0A0A46CC) — caractères nominaux, formes de présentation et règles d'usage des caractères de contrôle de l'écriture mongole traditionnelle ; remplace l'édition 2010
- [FAQ Unicode sur la zone à usage privé](https://www.unicode.org/faq/private_use.html)
- [Unicode Standard §13.5](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-13/) — mongol, y compris l'évolution de U+180E et U+202F

## Licence

Le code original de ce projet est publié sous **licence MIT** ; le texte complet se trouve dans
[`LICENSE`](LICENSE).

Cela signifie que vous pouvez librement utiliser, modifier, distribuer et exploiter commercialement ce
code, à condition de conserver la mention de copyright et de licence. Les composants tiers du dossier
`vendor/` conservent leurs propres licences (MIT / Apache-2.0 / OFL 1.1) — voir
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Limites à garder en tête :

- **Les polices mongoles commerciales ne sont pas distribuées ici.** Les polices installées telles que
  Menk / Menksoft sont chargées par le système via leur nom à l'exécution ; leur licence relève d'un
  accord entre vous et le fondeur, et ce projet n'accorde aucun droit sur les polices.
- Ce projet **n'a aucune certification de conformité aux normes**, et la licence MIT n'apporte aucune
  garantie. Vérifiez vous-même la mise en forme des glyphes et la pagination avant toute publication ou
  composition commerciale.

## Feuille de route

- [ ] Migration des conventions de glyphes 2010 ↔ 2023 avec tests de non-régression
- [ ] Vérification de conformité complète à GB/T 25914-2023
- [ ] Validation sur machine réelle de méthodes de saisie professionnelles précises
- [ ] Pagination automatique et fidélité des glyphes en PDF
- [ ] Import et export DOCX
- [ ] Historique de versions des documents

## Contribuer

Si ce projet vous est utile, la contribution la plus précieuse est de **fournir de vraies données de
test** : les noms et versions des méthodes de saisie que vous utilisez, ainsi que 3 à 5 petits
échantillons partageables par encodage. Les problèmes de compatibilité d'encodage ne peuvent être
résolus qu'avec des données réelles.
