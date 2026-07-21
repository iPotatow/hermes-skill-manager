# Hermes 技能管理

[English](README_EN.md) | 简体中文

`skill-manager`（Skill Manager / 技能管理）是独立的 Hermes Desktop 原生插件，用于查看和维护内建、Skills Hub 与本地技能，并可管理 Codex 用户技能。它不包含 Hermes Dashboard 页面，也不依赖 Dashboard 插件仓库。

## 功能

- Desktop 侧边栏页面与 `⌘K` 命令入口
- Dashboard 清单仅挂载后端 API，不注册 Dashboard 侧边栏
- Hermes 与 Codex 技能均使用紧凑表格展示，不使用技能卡片
- 按来源、分类和状态筛选，支持全文搜索
- 技能详情、最近操作、诊断与自动刷新
- 页面顶部提供插件更新按钮，点击后需再次确认；更新成功会自动热加载 Desktop 入口
- 内建技能重置、删除、恢复；Hub 技能重置、更新、删除；本地技能删除
- 删除和重置要求输入完整技能名确认，确认框可一键填入名称
- 社区和本地技能显示“同步”按钮，可一键同步到 `$CODEX_HOME/skills/<技能名>`；内建技能不显示该按钮，覆盖已有 Codex 技能时要求输入完整技能名确认
- 顶部来源筛选在“本地”后提供“Codex”入口；点击后在主表格中显示 Codex 用户技能，不显示 `.system` 系统技能，并支持安全删除
- 中英文界面、响应式布局及 Hermes Desktop 主题适配
- 后端未挂载时提供明确的安装、启用和重启提示

## 安装

仓库同时包含 Desktop UI 和它自己的 Python 后端。先安装并启用后端：

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

修改 Python 后端后需要重启 Hermes gateway。Desktop 文件会自动热加载；若侧边栏未出现“技能管理”，按 `⌘K` 运行 **Reload desktop plugins**。

安装后也可在页面顶部点击“更新插件”。确认后，Hermes 会通过安装目录的 Git 仓库拉取最新版本，并原子同步 Desktop 入口；若后端有变化，仍需重启 Hermes gateway。安装目录中的未提交修改如与更新冲突，Git 会停止更新，界面会显示原始错误。

### 从 1.4.1 或更早版本迁移

本版本将仓库改为 `iPotatow/hermes-skill-manager`，插件 ID 改为 `skill-manager`。旧 ID 无法通过普通热更新完成重命名，请执行一次新安装并停用旧插件：

```bash
hermes plugins disable desktop-skill-manager
hermes plugins install iPotatow/hermes-skill-manager
hermes plugins enable skill-manager
```

然后按上方命令安装新的 Desktop 入口并重启 Hermes gateway。新状态文件会自动读取旧插件的操作历史。

## 架构

- `plugin.js` 按 Hermes Desktop 约束保持为单个未编译 ESM 文件，内部按策略函数、数据查询、动作编排和 UI 组件分层。
- `plugin_api.py` 只负责 FastAPI 请求适配与错误转换；发现、路径、文件操作、运行时调用、状态和业务流程分别位于 `dashboard/skill_manager/`。
- 每个 API 请求重新解析 Hermes profile 路径；状态写入和 Codex 同步分别使用进程级锁，避免并发请求丢失历史或互相覆盖。

## 目录

```text
desktop-plugins/skill-manager/plugin.js          # 原生 Desktop UI
dashboard/manifest.json                         # 后端挂载声明（不注册 Dashboard 页面）
dashboard/plugin_api.py                         # 薄 FastAPI 适配器
dashboard/skill_manager/                        # 可测试的技能管理领域与基础设施
dashboard/data/builtin_catalog.json             # 内建技能描述
tests/                                          # Desktop 与后端测试
```

## 安全

- 文件操作会验证目标位于当前 Hermes profile 的技能目录内，并拒绝路径任一层的符号链接。
- 同步会拒绝路径逃逸、符号链接和特殊文件，并通过临时目录原子替换目标。
- 删除会物理移除技能目录，当前版本不会创建备份。
- 操作历史保存在 `$HERMES_HOME/state/plugins/skill-manager.json`，并兼容读取旧状态文件。
- 第三方插件会执行本地代码，请只安装可信来源。

## 验证

```bash
node --check desktop-plugins/skill-manager/plugin.js
node --test tests/desktop_plugin_smoke.test.js
python3 -m unittest discover -s tests -v
```

插件 ID：`skill-manager` · Desktop 路径：`/skill-manager` · 版本：`1.5.1`
