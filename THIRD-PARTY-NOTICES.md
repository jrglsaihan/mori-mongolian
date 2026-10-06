# 第三方组件许可说明

本项目的 MIT 许可（见 [`LICENSE`](LICENSE)）**仅适用于本项目原创代码**。

`vendor/` 目录下的第三方组件遵循各自许可，其完整许可文本已随代码一并保留：

| 组件 | 许可 | 完整文本 |
| --- | --- | --- |
| [ProseMirror](https://github.com/ProseMirror/prosemirror-view) | MIT | 各包 `LICENSE`（构建时汇总至 `web/THIRD-PARTY-NOTICES.txt`） |
| [Satsrag/mongol-convert 0.7.1](https://github.com/Satsrag/mongol-convert/tree/v0.7.1) | Apache-2.0 | [`vendor/mongol-convert-LICENSE.txt`](vendor/mongol-convert-LICENSE.txt) |
| └ mongol-norm 规范化后端 | Apache-2.0 | [`vendor/mongol-norm-LICENSE.txt`](vendor/mongol-norm-LICENSE.txt) |
| [Noto Sans Mongolian](https://github.com/google/fonts/tree/main/ofl/notosansmongolian) | SIL OFL 1.1 | [`vendor/Noto-OFL.txt`](vendor/Noto-OFL.txt) |

## 字体授权边界

**商业蒙古文字体不在本项目的分发范围内。**

本机安装的 Menk / Menksoft 等商业字体，仅由 macOS 在运行时按字体名称调用，本项目不复制、不打包、不重新分发这些字体文件，也**不授予任何字体权利**。在文档中嵌入或分发字体前，请自行与字体厂商确认授权条款。

仓库内仅包含一款可自由分发的兜底字体 Noto Sans Mongolian（SIL OFL 1.1）。

## 标准符合性声明

MIT 许可不附带任何担保。本项目**未通过** GB/T 25914 系列国家标准的符合性认证，也**未完成**任何企业输入法的实机验收。用于正式出版、印刷或商业排版前，请自行完成字形、控制字符与分页的验收工作。

详见 README 的「已知限制」章节。
