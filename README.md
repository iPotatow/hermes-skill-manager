<div align="center">

# Hermes Skill Manager

**在一个 Hermes Desktop 原生界面里管理 Hermes、QwenWork、WorkBuddy 与 Codex 技能。**

[English](README_EN.md) · 简体中文

</div>

Hermes Skill Manager 是独立的 Hermes Desktop 原生插件，用于查看、维护和同步分散在不同技能目录中的技能。它把 Hermes 内建技能、Skills Hub 社区技能、本地技能，以及 QwenWork、WorkBuddy 和 Codex 用户技能放进同一个管理入口，同时保留各来源自己的安全边界和操作规则。

当前版本：`1.10.1`

## 为什么需要它

技能并不总在一个地方：Hermes 有内建、社区和本地来源，QwenWork 与 WorkBuddy 各自维护独立目录，Codex 也有自己的用户技能。手动在多个目录之间查找、复制、更新和删除，不仅慢，也容易留下重复副本或误操作。

Hermes Skill Manager 的目标很简单：**让技能管理回到一个可见、可确认、可恢复的 Desktop 工作流里。**

## 你会得到什么

### 一个入口，管理四套技能生态

- **Hermes**：统一查看内建、社区和本地技能，支持来源、分类和全文搜索。
- **QwenWork / 千问办公**：读取 `~/.qwenworkcn/skills`，自动排除应用内建技能，只展示可管理的自定义或导入技能。
- **WorkBuddy**：读取 `~/.workbuddy/skills`，自动排除应用内建技能，只展示可管理的自定义或导入技能。
- **Codex**：查看用户技能，并区分“同步于 Hermes”和“仅 Codex”的技能来源。

### 面向真实操作，而不是只做浏览器

| 来源 | 可用操作 |
|---|---|
| Hermes 内建技能 | 重置、删除、恢复、同步到 Codex |
| Hermes 社区技能 | 重置、更新、删除、同步到 Codex |
| Hermes 本地技能 | 删除、同步到 Codex |
| QwenWork 技能 | 搜索、分类、查看详情、安全删除 |
| WorkBuddy 技能 | 搜索、分类、查看详情、安全删除 |
| Codex 用户技能 | 查看来源、删除 |

删除、重置和覆盖 Codex 技能等高风险操作会要求输入完整技能名确认。执行过程按“确认 → 执行 → 刷新”展示进度，并在当前技能行同步显示结果。

### 原生 Hermes Desktop 体验

- Desktop 侧边栏页面与 `⌘K` 命令入口。
- 紧凑表格布局，一级分段切换 Hermes、QwenWork、WorkBuddy 与 Codex。
- 行操作直接显示，不隐藏在下拉菜单中。
- 支持中英文界面、响应式布局和 Hermes Desktop 主题。
- 技能详情支持 `Esc` 关闭、焦点锁定与返回。
- 页面顶部可直接更新插件；Desktop 入口支持热加载。

## 快速开始

仓库同时包含 Desktop UI 和 Python 后端。先安装并启用插件后端：

```bash
hermes plugins install iPotatow/hermes-skill-manager
hermes plugins enable skill-manager
```

再安装 Desktop 入口：

```bash
HERMES_DIR="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$HERMES_DIR/desktop-plugins/skill-manager"
cp desktop-plugins/skill-manager/plugin.js \
  "$HERMES_DIR/desktop-plugins/skill-manager/plugin.js"
```

完成后重启 Hermes gateway。若侧边栏没有出现“技能管理”，按 `⌘K` 运行 **Reload desktop plugins**。

插件 ID：`skill-manager`  
Desktop 路径：`/skill-manager`

## 工作方式

Hermes Skill Manager 不注册 Hermes Dashboard 页面。Dashboard manifest 只挂载后端 API，真正的交互界面由 Hermes Desktop 原生插件提供。

Hermes 主视图把内建、社区和本地技能作为同一级来源展示；QwenWork、WorkBuddy 和 Codex 使用独立一级视图。QwenWork 或 WorkBuddy 没有可管理技能时，对应视图会自动隐藏。

Hermes 内建技能的中文简介来自 [Hermes 官方中文技能目录](https://hermes-agent.nousresearch.com/docs/zh-Hans/reference/skills-catalog)。GitHub Actions 每周同步官方中文文档并保存离线快照；如果官方译文缺失，会阻止错误快照提交。

## 同步到 Codex

Hermes 的内建、社区和本地技能都可以一键同步到 Codex 用户技能目录。

同步时会：

- 验证源路径和目标路径，拒绝路径逃逸、符号链接与特殊文件。
- 通过临时目录原子替换目标，避免留下半完成状态。
- 在覆盖已有 Codex 技能前要求输入完整技能名确认。
- 在 Codex 视图中标记同步来源，区分“同步于 Hermes”和“仅 Codex”。
- 隐藏 Codex `.system` 系统技能，只管理用户技能。

## 安全边界

文件操作会验证目标位于当前 Hermes profile 的技能目录内，并拒绝路径任一层的符号链接。

删除操作会物理移除技能目录，当前版本**不会创建备份**。删除社区技能时，插件还会清理当前发现到的残留副本并刷新发现缓存，避免残留目录重新被识别成本地技能。

操作历史保存在：

```text
$HERMES_HOME/state/plugins/skill-manager.json
```

新版本兼容读取旧插件状态文件。第三方 Hermes 插件会执行本地代码，请只安装可信来源。

## 更新插件

安装完成后，可以直接点击页面顶部的“更新插件”。确认后，Hermes 会通过插件安装目录中的 Git 仓库拉取最新版本，并原子同步 Desktop 入口。

- 只有 Desktop 文件变化时，可直接热加载。
- Python 后端发生变化后，仍需重启 Hermes gateway。
- 如果安装目录存在与远端更新冲突的未提交修改，Git 会停止更新，界面会显示原始错误，不会强行覆盖本地内容。

## 从 1.4.1 或更早版本迁移

仓库已迁移到 `iPotatow/hermes-skill-manager`，插件 ID 也已改为 `skill-manager`。旧 ID 无法通过普通热更新完成重命名，需要执行一次新安装：

```bash
hermes plugins disable desktop-skill-manager
hermes plugins install iPotatow/hermes-skill-manager
hermes plugins enable skill-manager
```

然后按“快速开始”中的命令安装新的 Desktop 入口并重启 Hermes gateway。新状态文件会自动读取旧插件的操作历史。

## 架构

```text
desktop-plugins/skill-manager/plugin.js          # 原生 Desktop UI
dashboard/manifest.json                         # 后端挂载声明，不注册 Dashboard 页面
dashboard/plugin_api.py                         # FastAPI 请求适配与错误转换
dashboard/skill_manager/                        # 技能发现、文件操作、同步、状态与业务流程
dashboard/data/builtin_catalog.json             # 官方中文内建技能目录离线快照
scripts/sync_builtin_catalog.py                 # 官方目录快照同步工具
.github/workflows/sync-skill-translations.yml  # 每周同步官方中文快照
tests/                                          # Desktop 与后端测试
```

`plugin.js` 按 Hermes Desktop 约束保持为单个未编译 ESM 文件。`plugin_api.py` 只负责 FastAPI 请求适配和错误转换，实际技能发现、运行时调用、状态与文件操作分别位于 `dashboard/skill_manager/`。

每个 API 请求都会重新解析 Hermes profile 路径；状态写入和 Codex 同步分别使用进程级锁，避免并发请求覆盖操作历史或同步结果。

## 验证

```bash
node --check desktop-plugins/skill-manager/plugin.js
node --test tests/desktop_plugin_smoke.test.js
python3 -m unittest discover -s tests -v
```
