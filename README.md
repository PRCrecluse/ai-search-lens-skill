# AI Search Lens Skill

独立、开源、可直接安装的 **GEO / AI 搜索研究 Skill**。包含完整运行代码，安装后无需另行克隆应用仓库。MIT 许可证，支持 Codex 和 Claude Code，运行需要 **Node.js 22.9+**。

Trace visible AI search queries, brand mentions, sources and citations, then export a self-contained HTML evidence report. This repository is the standalone skill distribution of [AI Search Lens](https://github.com/PRCrecluse/ai-search-lens).

## 在线体验与图文教程

| 入口 | 链接 |
| --- | --- |
| 在线工具 / Tool page | [goglobal.to/tools/ai-search-lens](https://www.goglobal.to/tools/ai-search-lens) |
| GEO Skill / Skill page | [goglobal.to/skills/geo](https://www.goglobal.to/skills/geo) |
| Skills 聚合页 | [goglobal.to/skills](https://www.goglobal.to/skills) |
| 图文使用指南 | [从单个 query 到可导出的研究报告](docs/usage-guide.md) |
| 命令行下载 | [最新 Release · ZIP / tar.gz / SHA256](https://github.com/PRCrecluse/ai-search-lens-skill/releases/latest) |

[![AI Search Lens 在线工具与合成示例报告预览](docs/images/tool-overview.png)](https://www.goglobal.to/tools/ai-search-lens)

上图为 Ego Lite 导出的线上页面打印视图，使用合成示例数据。完整的品牌分析、查询展开、来源引用及安装步骤请看 **[图文使用指南](docs/usage-guide.md)**。

## 一条命令安装 / Skills CLI

```sh
# 安装到当前项目的 Codex 和 Claude Code；交互选择安装方式
npx skills add PRCrecluse/ai-search-lens-skill

# 全局安装到 Codex
npx skills add PRCrecluse/ai-search-lens-skill --skill ai-search-lens --agent codex --global --yes

# 全局安装到 Claude Code
npx skills add PRCrecluse/ai-search-lens-skill --skill ai-search-lens --agent claude-code --global --yes
```

去掉 `--global` 即可安装到当前项目。安装完成后开启新的 Agent 会话，输入：

> 使用 $ai-search-lens 研究 “best ai music video generator”，跟踪 Freebeat、Neural Frames 和 Kaiber，导出查询展开、品牌证据和引用来源的 HTML 报告。

也可以用 `npx skills check` 检查更新，或用 `npx skills update` 更新通过该工具安装的 Skills。

## Git 拉取和安装

```sh
git clone https://github.com/PRCrecluse/ai-search-lens-skill.git
cd ai-search-lens-skill
node scripts/install.mjs --agent codex

# 或安装到 Claude Code
node scripts/install.mjs --agent claude-code

# 自定义目录 / 项目级安装
node scripts/install.mjs --target /absolute/path/to/project/.claude/skills/ai-search-lens
```

安装器默认复制到 `~/.codex/skills/ai-search-lens`（尊重 `CODEX_HOME`）或 `~/.claude/skills/ai-search-lens`，不复制真实 API Key、历史数据或报告。

```sh
# 更新通过 Git 安装的版本
git pull --ff-only
node scripts/install.mjs --agent codex --force
```

`--force` 更新分发文件，保留安装目录中的 `.env` 和已有报告。

## 命令行下载 / Release

GitHub CLI：

```sh
gh release download --repo PRCrecluse/ai-search-lens-skill --pattern 'ai-search-lens-skill.*' --pattern 'SHA256SUMS'
shasum -a 256 -c SHA256SUMS
tar -xzf ai-search-lens-skill.tar.gz
cd ai-search-lens-skill
node scripts/install.mjs --agent codex
```

无需 GitHub CLI，也可以用 `curl` 下载：

```sh
curl -fL https://github.com/PRCrecluse/ai-search-lens-skill/releases/latest/download/ai-search-lens-skill.tar.gz -o ai-search-lens-skill.tar.gz
tar -xzf ai-search-lens-skill.tar.gz
cd ai-search-lens-skill
node scripts/install.mjs --agent codex
```

Release 同时提供 `.zip` 和 SHA-256 校验文件。需要固定版本时，将 URL 中的 `latest/download` 改为 `download/v1.0.0`。

## 下载后直接运行

在仓库或解压目录中，无需安装 npm 依赖：

```sh
# 无 API Key 的冒烟验证：生成明确标记的合成示例
node runtime/scripts/research.mjs --demo --out ./reports/demo

# 启动本地界面：http://127.0.0.1:4317
cd runtime
npm start
```

真实研究：把 `runtime/.env.example` 复制为 `runtime/.env`，自行填写 `OPENAI_API_KEY`，然后在 `runtime` 目录执行：

```sh
npm run report -- --query "best ai music video generator" --brand Freebeat --domain freebeat.ai --out ./reports/music
```

可通过 `OPENAI_MODEL` 选择账号支持的模型，通过 `OPENAI_BASE_URL` 配置兼容的 Responses API 服务。API 调用由自己的服务商账号计费；导入已有响应和示例不调用模型。

报告包含可见 query fan-out、工具调用、品牌与竞品提及、来源域名、来源 URL 和最终引用，并支持 HTML、Markdown、原始及结构化 JSON 导出。报告只能呈现 API 公开返回的信息，不包含隐藏思维链；单次响应不是总体品牌可见率或搜索量。

## 仓库结构

- `docs/`：图文使用指南与配图。
- `SKILL.md`：Agent 入口指令。
- `agents/`、`references/`：Agent 元信息和数据契约。
- `runtime/`：完整、无第三方 npm 依赖的本地运行代码。
- `scripts/install.mjs`：可选的本地安装器。
