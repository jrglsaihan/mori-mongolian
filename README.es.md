# Mori — escritura mongola

Un editor de documentos con composición vertical para la escritura mongola tradicional (vista previa para macOS).

[English](README.md) · [简体中文](README.zh-CN.md) · [Монгол](README.mn.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · **Español**

[![License: MIT](https://img.shields.io/badge/License-MIT-b9ce9c.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%2013%2B-b9ce9c.svg)](#compilación)

La escritura mongola tradicional se lee **de arriba hacia abajo, con las columnas avanzando de izquierda
a derecha**. Por eso la interfaz es apaisada: la página se extiende en horizontal mientras el texto crece
en vertical.

![Mori en macOS](docs/preview.png)

> **Estado: vista previa de desarrollo funcional (v0.2.0).**
> La edición, las fuentes del sistema, la conservación del texto original y la conversión explícita de
> codificación funcionan. Sin embargo, el proyecto **no** ha superado la verificación completa de
> conformidad con las normas nacionales chinas para el mongol, y **ninguna** método de entrada
> empresarial se ha validado en equipo real. No lo consideres un sustituto acabado de Word.

---

## Qué es esto

Una aplicación local para Mac totalmente sin conexión. Sin acceso a red, sin subida de documentos, sin
servicios en la nube, sin fuentes ni métodos de entrada comerciales incluidos.

- **Envoltorio nativo**: Swift + AppKit + WKWebView, binario universal (Apple Silicon / Intel)
- **Editor**: ProseMirror con `writing-mode: vertical-lr` — composición vertical real, no una horizontal girada
- **Conversión**: Satsrag/mongol-convert 0.7.1 WASM, ejecutado localmente
- **Fuente de reserva**: Noto Sans Mongolian (SIL OFL 1.1)

## Qué está implementado

### Edición y composición
- Texto enriquecido vertical: arriba → abajo, columnas izquierda → derecha; lienzo horizontal continuo con zoom
- Títulos / cuerpo de texto / listas con viñetas; negrita, cursiva, subrayado, color del texto
- Deshacer / rehacer, buscar y reemplazar todo
- Fuente, tamaño, interlineado, alineación, márgenes y guías de caja de texto a nivel de documento
- Paleta de caracteres de control: FVS (U+180B–180D), MVS (U+180E), NNBSP (U+202F), ZWJ / ZWNJ, puntuación mongola
- Lectura en vivo de los puntos de código de la selección (U+XXXX), y recuento de caracteres, palabras y área de uso privado

### Capacidades nativas de macOS
- Barra de menús AppKit, paneles nativos de abrir y guardar, aviso de cambios sin guardar al salir
- **Enumera todas las fuentes instaladas** y comprueba la cobertura de puntos de código mongoles, de modo que las fuentes mongolas instaladas se pueden elegir directamente
- Se conecta al ciclo de composición del método de entrada del sistema y **nunca modifica el documento durante la composición**
- Guarda los documentos como `.mglx`, conservando el texto enriquecido, la configuración de fuente y los bytes originales importados
- Exportación a TXT / HTML, impresión del sistema y guardar como PDF

## Qué admiten realmente los tres perfiles de codificación

Las tres opciones de la captura original corresponden a distintas **convenciones de glifos y caracteres
de control**; no son números de versión de Unicode:

| Perfil | Comportamiento en esta versión | Aún no hecho |
| --- | --- | --- |
| Mongol (norma nacional 2023) | Edición del texto Unicode original, FVS / MVS conservados, modelado por la fuente elegida | Conformidad completa con GB/T 25914-2023 |
| Mongol (norma nacional 2010) | Las convenciones antiguas se conservan tal cual; no se reescriben letras, selectores de variante ni separadores de sufijo | Migración automática 2010 ↔ 2023 |
| Mongol (codificación Menksoft) | Edición del texto original en el área de uso privado; vista previa de conversión MenkShape / MenkLetter y exportación de una copia | Tablas de correspondencia PUA completas, ida y vuelta garantizada sin pérdidas |

**Cambiar de perfil solo modifica los metadatos del documento y nunca reescribe los puntos de código del
texto.** Es deliberado: la migración automática no está verificada y una conversión silenciosa corrompe el texto.

Sobre los nombres `International 2010` / `International 2023`: lo más probable es que se refieran a las
convenciones de glifos de las dos normas nacionales GB/T 25914-2010 y GB/T 25914-2023 (la edición de 2023
sustituye a la de 2010), y no a versiones de Unicode. Este proyecto no ha verificado cómo lo implementa
ningún fabricante concreto.

### Dónde encaja GB18030

GB18030 es una **capa de codificación de bytes de archivo**. Es un asunto distinto de los caracteres
nominales mongoles, las convenciones de glifos y el modelado de la fuente. La importación usa el
descodificador del sistema; el texto exportado es siempre UTF-8.

## Seguridad de las conversiones

Resultado medido: tras una ida y vuelta por el motor de código abierto actual, la palabra de ejemplo
`ᠮᠣᠩᠭᠣᠯ` **no vuelve con letras nominales idénticas**. Por lo tanto:

- La conversión **solo genera una vista previa y una copia** — nunca sustituye el cuerpo del documento
- Cada conversión ejecuta automáticamente una comprobación de ida y vuelta y avisa con claridad si falla
- Que el motor no avise y que los glifos se parezcan visualmente no demuestra que el texto esté intacto

> La conversión de codificaciones mongolas conlleva una pérdida de información inherente a la
> normalización de glifos. **Nunca sobrescribas tu único original con el resultado de una conversión.**

## Compilación

Requiere macOS, Apple Command Line Tools y Node.js 22+.

```bash
npm install
npm run build:web        # genera web/ (ignorado por git)
```

El script de compilación de la aplicación nativa escribe por defecto en `outputs/`, junto al directorio del proyecto:

```bash
mkdir -p ../outputs
npm run build:mac        # compila arm64 + x86_64 y empaqueta ../outputs/Mori.app
```

Pruebas:

```bash
npm test                 # 21 pruebas de codificación e integridad de documentos
```

Autocomprobación nativa opcional (escribe un informe y una captura de pantalla):

```bash
../outputs/Mori.app/Contents/MacOS/Mori \
  --smoke-test tests/native-results.json \
  --snapshot docs/preview.png
```

### Añadido en la v0.2

- **Fuente y tamaño a nivel de selección** — los controles de fuente y tamaño ahora modifican el texto seleccionado; sin selección cambian el valor predeterminado del documento.
- **Formato de párrafo y de carácter** — títulos H1–H3 (⌘0–⌘3), sangría de párrafo, sangría de primera línea, interlineado por párrafo, cuatro alineaciones, superíndice y subíndice.
- **Configuración de página y paginación** — A4/A3, horizontal/vertical, márgenes predefinidos, vista previa de paginación de solo lectura y PDF paginado. La paginación se calcula midiendo cada bloque, así que un título más grande ocupa proporcionalmente más espacio.
- **Importación y exportación de DOCX** mediante un LibreOffice instalado localmente, invocado como **proceso separado**. No se enlaza ni se empaqueta nada, por lo que las obligaciones GPL-3.0 de LibreOffice no alcanzan a este proyecto con licencia MIT. `MORI_SOFFICE` permite indicar una ruta no estándar.

## Resultados de verificación

| Elemento | Resultado |
| --- | --- |
| Pruebas del núcleo | 49 / 49 superadas |
| Comprobaciones del editor nativo | 56 / 56 superadas |
| Estilos de fuente instalados enumerados | 557 |
| Fuentes que cubren los puntos de código mongoles de muestra | 44 |
| Fuentes que cubren los puntos de código PUA probados | 47 |

La cobertura incluye: fidelidad de los caracteres de control Unicode, UTF-8 / UTF-16, muestras de
GB18030, rechazo de entradas no válidas, serialización y validación de versión de documentos, estadísticas
de puntos de código, avisos de ida y vuelta en la conversión, deshacer / rehacer, búsqueda a través del
formato en línea, protección de la tecla de confirmación del método de entrada, enumeración de fuentes
nativas y relectura de una copia de recuperación aislada.

**No son certificaciones de normas ni certificaciones de métodos de entrada.** Consulta
[`tests/native-results.json`](tests/native-results.json) y [`tests/core-results.json`](tests/core-results.json).

## Limitaciones conocidas

- **Métodos de entrada**: el enganche a la composición estándar está implementado, pero Menksoft y los
  distintos métodos de entrada mongoles empresariales aún necesitan validación en equipo real, fabricante
  por fabricante y versión por versión. Los métodos de entrada de Windows no funcionarán en macOS solo
  porque se haya añadido un adaptador de codificación.
- **Funciones de Word**: sin tablas, imágenes, encabezados/pies de página, números de página, notas al pie, control de cambios ni comentarios; la paginación es una vista previa de solo lectura, no edición dentro de la página.
- **Paginación y PDF**: la paginación medida por bloques y la salida PDF paginada están implementadas. Un párrafo más largo que una página no se divide: ocupa su propia página con un aviso de posible recorte. La fidelidad glifo a glifo del PDF sigue sin verificarse.
- **Alcance de juegos de caracteres**: la conversión completa para todo, sibe y manchú queda fuera del alcance verificado.
- **Copia de recuperación**: solo conserva el último espacio de trabajo
  (`~/Library/Application Support/Mori/draft.mglx`); no es un historial de versiones.
- **Verificación de plataforma**: probado solo en Apple Silicon; Intel y versiones antiguas de macOS no están verificados.
- **Firma**: firma local ad hoc, **sin firma de Apple Developer ID ni notarización**, por lo que el primer
  inicio en otro Mac puede mostrar un aviso de seguridad.

## Estructura del repositorio

```
src/        editor (HTML / CSS / lógica de ProseMirror / núcleo de codificación)
native/     envoltorio nativo Swift, Info.plist, script de compilación
vendor/     motor de conversión sin conexión (WASM) y fuente de reserva
tests/      pruebas automatizadas y evidencia de resultados
docs/       captura de pantalla y notas de la versión
LICENSE     texto completo de la licencia MIT
THIRD-PARTY-NOTICES.md  licencias de terceros y límites de derechos sobre fuentes
build.cjs   script de empaquetado web
```

## Componentes de terceros

| Componente | Licencia | Nota |
| --- | --- | --- |
| [ProseMirror](https://github.com/ProseMirror/prosemirror-view) | MIT | Motor de edición de texto enriquecido |
| [Satsrag/mongol-convert 0.7.1](https://github.com/Satsrag/mongol-convert/tree/v0.7.1) | Apache-2.0 | Conversión de codificación WASM local, con el backend de normalización mongol-norm |
| [Noto Sans Mongolian](https://github.com/google/fonts/tree/main/ofl/notosansmongolian) | SIL OFL 1.1 | Fuente de reserva |

Los textos completos de las licencias están en [`vendor/`](vendor) y [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
La compilación genera automáticamente `web/THIRD-PARTY-NOTICES.txt`.

**Las fuentes comerciales (por ejemplo, una familia Menk / Menksoft instalada) no se copian ni se
empaquetan** — el sistema las carga por su nombre en tiempo de ejecución.

### Referencias normativas

- [GB/T 25914-2023](https://std.samr.gov.cn/gb/search/gbDetailed?id=0B4529DE108FFCAFE06397BE0A0A46CC) — caracteres nominales, formas de presentación y reglas de uso de los caracteres de control de la escritura mongola tradicional; sustituye a la edición de 2010
- [Preguntas frecuentes de Unicode sobre el área de uso privado](https://www.unicode.org/faq/private_use.html)
- [Unicode Standard §13.5](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-13/) — mongol, incluida la evolución de U+180E y U+202F

## Licencia

El código original de este proyecto se publica bajo la **licencia MIT**; el texto completo está en
[`LICENSE`](LICENSE).

Eso significa que puedes usar, modificar, distribuir y explotar comercialmente este código libremente,
siempre que conserves el aviso de copyright y de licencia. Los componentes de terceros en `vendor/`
mantienen sus propias licencias (MIT / Apache-2.0 / OFL 1.1) — consulta
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

Límites que conviene tener presentes:

- **Las fuentes mongolas comerciales no se distribuyen aquí.** Las fuentes instaladas como Menk /
  Menksoft las carga el sistema por su nombre en tiempo de ejecución; su licencia es un acuerdo entre tú
  y el fabricante, y este proyecto no concede ningún derecho sobre fuentes.
- Este proyecto **no tiene certificación de conformidad con normas**, y la licencia MIT no ofrece ninguna
  garantía. Verifica por tu cuenta el modelado de glifos y la paginación antes de publicar o componer con
  fines comerciales.

## Hoja de ruta

- [ ] Migración de convenciones de glifos 2010 ↔ 2023 con pruebas de regresión
- [ ] Verificación de conformidad completa con GB/T 25914-2023
- [ ] Validación en equipo real de métodos de entrada empresariales concretos
- [x] Paginación automática y fidelidad de glifos en PDF
- [x] Importación y exportación de DOCX
- [ ] Historial de versiones de documentos

## Contribuir

Si este proyecto te resulta útil, la contribución más valiosa son **datos de prueba reales**: los nombres
y versiones de los métodos de entrada que usas, además de 3 a 5 muestras pequeñas y publicables por
codificación. Los problemas de compatibilidad de codificación solo se resuelven con datos reales.
