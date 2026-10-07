# Mori 蒙文书写

[English](README.md) · **简体中文** · [Монгол](README.mn.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md)

面向传统蒙古文的竖排文档编辑器（macOS 预览版）。

[![License: MIT](https://img.shields.io/badge/License-MIT-b9ce9c.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%2013%2B-b9ce9c.svg)](#构建)

传统蒙古文书写方向为**从上到下、列从左到右**，因此界面采用横版布局：纸张横向铺开，文字竖向生长。

![Mori 蒙文书写 运行截图](docs/preview.png)

> **当前状态：可运行的开发预览版（v0.2.0）。**
> 编辑、本机字体、原文保护、显式编码转换已经可用；但**尚未**通过中国蒙古文相关国家标准的全项符合性认证，也**尚未**完成任何企业输入法的实机验收。请勿把它当作已完成的 Word 替代品使用。

---

## 这是什么

一个完全离线的本地 Mac 应用。不联网、不上传文档、不依赖云服务、不捆绑商业字体或输入法。

- **原生外壳**：Swift + AppKit + WKWebView，Universal 二进制（Apple Silicon / Intel）
- **编辑器**：ProseMirror，`writing-mode: vertical-lr`，真正的竖排而非旋转模拟
- **编码转换**：内置 Satsrag/mongol-convert 0.7.1 WASM，本地运行
- **兜底字体**：Noto Sans Mongolian（SIL OFL 1.1）

## 已实现

### 编辑与排版
- 竖排富文本：上 → 下，列左 → 右；横向连续画布，可缩放
- 标题 / 正文 / 项目列表、粗体 / 斜体 / 下划线 / 文字颜色
- 撤销 / 重做、查找与全部替换
- 文档级字体、字号、行距、对齐、页边距与版心辅助线
- 控制字符插入面板：FVS（U+180B–180D）、MVS（U+180E）、NNBSP（U+202F）、ZWJ / ZWNJ、蒙古文标点
- 选区码点实时查看（U+XXXX），字符 / 词数 / 私用区统计

### macOS 本地能力
- AppKit 菜单栏、原生打开 / 保存对话框、未保存离开提醒
- **枚举本机全部字体**并检测蒙古文码位覆盖，可在下拉框中直接选用已安装的蒙古文字体
- 接入系统输入法组字生命周期，**组字过程中不改动正文**
- 文档保存为 `.mglx`（保留富文本、字体配置与导入原始字节）
- TXT / HTML 导出、系统打印与另存为 PDF 入口

## 三类编码配置的真实支持范围

截图中的三个选项对应不同的**字形与控制约定**，不是 Unicode 的版本号：

| 配置 | 本版本行为 | 尚未完成 |
| --- | --- | --- |
| 蒙古文（国标2023） | Unicode 原文编辑，保留 FVS / MVS，由所选字体塑形 | GB/T 25914-2023 全项符合性认证 |
| 蒙古文（国标2010） | 旧约定原文保留，不改写字母、变体符与后缀分隔符 | 2010 ↔ 2023 自动约定迁移 |
| 蒙古文（蒙科立编码） | 私用区原文编辑；MenkShape / MenkLetter 显式转换预览与副本导出 | 全部私用区字体映射、无损往返保证 |

**切换顶部配置只改变文档元数据，不会改写正文码点。** 这是刻意的设计：自动迁移尚未验证，静默转换会损坏文本。

关于 `国际2010` / `国际2023` 的命名：这两者更可能是 GB/T 25914-2010 与 GB/T 25914-2023 两版国家标准的字形约定（2023 版已替代 2010 版），而非 Unicode 版本。具体到某一厂商软件的实现方式，本项目未做核实。

### GB18030 的定位

GB18030 属于**文件字节编码层**，与蒙古文名义字符、字形约定、字体塑形是四个不同的问题。导入时使用系统解码器，导出文本统一为 UTF-8。

## 转换安全

实测发现：示例词 `ᠮᠣᠩᠭᠣᠯ` 经当前开源转换引擎往返后，**名义字母并不相同**。因此：

- 转换**只生成预览与副本**，绝不替换正文
- 每次转换自动做往返校验，失败时给出明确警告
- 引擎无警告、字形相似，都不代表文本无损

> 蒙古文编码转换涉及字形规范化的固有信息损失。**不要用转换结果覆盖唯一原件。**

## 构建

需要 macOS、Apple Command Line Tools、Node.js 22+。

```bash
npm install
npm run build:web        # 生成 web/ 目录（已 gitignore）
```

原生应用构建脚本默认输出到项目父目录的 `outputs/`：

```bash
mkdir -p ../outputs
npm run build:mac        # 编译 arm64 + x86_64 并打包 ../outputs/Mori.app
```

测试：

```bash
npm test                 # 21 项编码与文档完整性测试
```

原生界面自检（可选，会输出报告与截图）：

```bash
../outputs/Mori.app/Contents/MacOS/Mori \
  --smoke-test tests/native-results.json \
  --snapshot docs/preview.png
```

### v0.2 新增

- **选区级字体与字号** —— 字体和字号控件现在会改写选中文字；无选区时修改文档默认值。工具栏徽章显示当前作用范围。
- **段落与字符格式** —— 多级标题 H1–H3（⌘0–⌘3）、段落缩进、首行缩进、段落行距、四种对齐、上标与下标（⌘. / ⌘,）。
- **页面设置与分页** —— A4/A3、横向/纵向、页边距预设、只读分页预览与分页 PDF 输出。分页通过逐块测量计算，标题等大字号的块会按比例占用更多版面。
- **DOCX 导入导出** —— 调用本机已安装的 LibreOffice，以**独立进程**执行。不链接、不打包，因此 LibreOffice 的 GPL-3.0 义务不波及本 MIT 项目。可用 `MORI_SOFFICE` 指定非标准安装路径。

### baosao —— 内置 DOCX 引擎

DOCX 不是专有格式，它是 ZIP 容器里装若干 XML。**baosao** 自己把这套东西写了出来，**导出不再调用任何外部转换器，也不再需要 LibreOffice**。

- `src/baosao/zip.js` —— 零依赖 ZIP 写入器（含 CRC32）。优先用系统的 `CompressionStream('deflate-raw')`，不可用则退回 STORED——DOCX 允许 STORED 条目
- `src/baosao/ooxml.js` —— 文档模型转 WordprocessingML：段落、标题、粗斜下划线、颜色、字体字号、上下标、对齐、缩进与首行缩进、行距、项目符号、纸张与页边距
- `src/baosao/index.js` —— 组装十个部件并**自检**

**蒙古文竖排写入 `<w:textDirection w:val="tbLrV"/>`**（行内上→下、列左→右）。同族的 `tbRl` 是中日韩竖排（列右→左），自检里有断言防止误用。

每次导出先自检——中央目录可读、必需部件齐全、CRC 匹配、每个 XML 格式正确、竖排方向正确——**不过就不落盘**。

> **尚未验证**：微软自己的兼容性文档（MS-OI29500）记录 Word 在表格里把 `tbLrV` 解释为整体旋转 90°，那是假竖排。文件符合 ECMA-376，但 **Word 实际渲染成什么样必须拿真 Word 确认**。

## 验证结果

| 项目 | 结果 |
| --- | --- |
| 核心测试 | 59 / 59 通过 |
| 原生编辑器检查 | 75 / 75 通过 |
| 本机字体字形枚举 | 557 个 |
| 覆盖蒙古文样本码位 | 44 个字体 |
| 覆盖测试私用区码位 | 47 个字体 |

覆盖范围包括：Unicode 控制字符保真、UTF-8 / UTF-16、GB18030 样本、非法输入拒绝、文档序列化与版本校验、码点统计、转换往返警告、撤销 / 重做、跨行内格式查找、输入法确认键保护、原生字体枚举、隔离恢复副本回读。

**这些测试不是标准认证，也不是输入法认证。** 详见 [`tests/native-results.json`](tests/native-results.json) 与 [`tests/core-results.json`](tests/core-results.json)。

## 已知限制

- **输入法**：已实现标准组字接入，但蒙科立、各类蒙文企业输入法仍需按厂商与版本逐个实机验收。Windows 输入法不会因增加编码适配而直接在 Mac 运行。
- **Word 能力**：无表格、图片、页眉页脚、页码域、脚注、修订与批注；分页为只读预览，不是页内直接编辑。
- **分页与 PDF**：已实现按块测量的分页与分页 PDF 输出。超过单页容量的超长段落不会自动拆分，会单独成页并提示裁切风险。PDF 逐字字形保真仍未验收，请检查打印预览。
- **字符集范围**：托忒、锡伯、满文的完整转换不在已验证范围内。
- **恢复副本**：仅保留最近工作区（`~/Library/Application Support/Mori/draft.mglx`），不是多版本历史。
- **平台验证**：仅 Apple Silicon 实机测试；Intel 与旧版 macOS 未验证。
- **签名**：本地临时签名，**未做 Apple Developer ID 签名与公证**，其他 Mac 首次打开可能触发安全提示。

## 目录结构

```
src/        编辑器（HTML / CSS / ProseMirror 逻辑 / 编码核心）
native/     Swift 原生外壳、Info.plist、构建脚本
vendor/     离线转换引擎（WASM）与兜底字体
tests/      自动化测试与结果证据
docs/       截图与发布说明
LICENSE     MIT 许可全文
THIRD-PARTY-NOTICES.md  第三方组件许可与字体授权边界
build.cjs   web 打包脚本
```

## 第三方组件与许可

| 组件 | 许可 | 说明 |
| --- | --- | --- |
| [ProseMirror](https://github.com/ProseMirror/prosemirror-view) | MIT | 富文本编辑引擎 |
| [Satsrag/mongol-convert 0.7.1](https://github.com/Satsrag/mongol-convert/tree/v0.7.1) | Apache-2.0 | 本地 WASM 编码转换，含 mongol-norm 规范化后端 |
| [Noto Sans Mongolian](https://github.com/google/fonts/tree/main/ofl/notosansmongolian) | SIL OFL 1.1 | 兜底字体 |

完整许可文本见 [`vendor/`](vendor) 与 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。构建时会自动生成 `web/THIRD-PARTY-NOTICES.txt`。

**商业字体（如本机已安装的 Menk / Menksoft 系列）不会被复制或打包**，仅在使用时由系统按名称调用。

### 标准依据

- [GB/T 25914-2023](https://std.samr.gov.cn/gb/search/gbDetailed?id=0B4529DE108FFCAFE06397BE0A0A46CC) — 传统蒙古文名义字符、变形显现字符与控制字符使用规则，已替代 2010 版
- [Unicode 私有使用区说明](https://www.unicode.org/faq/private_use.html)
- [Unicode Standard §13.5](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-13/) — 蒙古文，含 U+180E 与 U+202F 的演进

## 许可

本项目原创代码采用 **MIT License**，完整文本见 [`LICENSE`](LICENSE)。

这意味着你可以自由使用、修改、分发、商用这份代码，只需保留版权与许可声明。`vendor/` 下的第三方组件遵循各自许可（MIT / Apache-2.0 / OFL 1.1），详见 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。

需要留意的边界：

- **商业蒙古文字体不在分发范围内。** 本机安装的 Menk / Menksoft 等字体仅由系统在运行时按名称调用，其授权由字体厂商另行约定，本项目不授予任何字体权利。
- 本项目**未做标准符合性认证**，MIT 也不附带任何担保。用于正式出版或商业排版前，请自行完成字形与分页验收。

## 路线图

- [ ] 2010 ↔ 2023 字形约定迁移与回归用例
- [ ] GB/T 25914-2023 全项符合性验证
- [ ] 指定企业输入法实机验收
- [x] 长文自动分页与 PDF 字形保真
- [x] DOCX 导入导出
- [ ] 多版本文档历史

## 参与贡献

如果这个项目对你有用，最有价值的贡献是**提供真实测试样本**：常用输入法的名称与版本，以及每种编码 3–5 份可公开用于测试的小样。编码兼容问题只能靠真实数据收敛。
