# Hermes Desktop 技能管理

[English](README_EN.md) | 简体中文

`desktop-skill-manager` 是独立的 Hermes Desktop 原生插件，用于查看和维护内建、Skills Hub 与本地技能，并可将 Hermes 社区或本地技能同步到 Codex。它不包含 Hermes Dashboard 页面，也不依赖 Dashboard 插件仓库。

## 功能

- Desktop 侧边栏页面与 `⌘K` 命令入口
- 按来源、分类和状态筛选，支持全文搜索
- 技能详情、最近操作、诊断与自动刷新
- 内建技能重置、删除、恢复；Hub 技能重置、更新、删除；本地技能删除
- 删除和重置要求输入完整技能名确认
- 社区和本地技能显示“同步”按钮，可一键同步到 `$CODEX_HOME/skills/<技能名>`；内建技能不显示该按钮，覆盖已有 Codex 技能时要求输入完整技能名确认
- 单独列出 `$CODEX_HOME/skills` 下已发现的 Codex 用户技能与系统技能
- 中英文界面、响应式布局及 Hermes Desktop 主题适配
- 后端未挂载时提供明确的安装、启用和重启提示

## 安装

仓库同时包含 Desktop UI 和它自己的 Python 后端。先安装并启用后端：

```bash
hermes plugins install iPotatow/hermes-desktop-skill-manager
hermes plugins enable desktop-skill-manager
```

再安装 Desktop 入口：

```bash
HERMES_DIR="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$HERMES_DIR/desktop-plugins/desktop-skill-manager"
cp desktop-plugins/desktop-skill-manager/plugin.js \
  "$HERMES_DIR/desktop-plugins/desktop-skill-manager/plugin.js"
```

修改 Python 后端后需要重启 Hermes gateway。Desktop 文件会自动热加载；若侧边栏未出现“技能”，按 `⌘K` 运行 **Reload desktop plugins**。

## 架构

- `plugin.js` 按 Hermes Desktop 约束保持为单个未编译 ESM 文件，内部按策略函数、数据查询、动作编排和 UI 组件分层。
- `plugin_api.py` 只负责 FastAPI 请求适配与错误转换；发现、路径、文件操作、运行时调用、状态和业务流程分别位于 `dashboard/desktop_skill_manager/`。
- 每个 API 请求重新解析 Hermes profile 路径；状态写入和 Codex 同步分别使用进程级锁，避免并发请求丢失历史或互相覆盖。

## 目录

```text
desktop-plugins/desktop-skill-manager/plugin.js  # 原生 Desktop UI
dashboard/manifest.json                         # 后端挂载声明（不注册 Dashboard 页面）
dashboard/plugin_api.py                         # 薄 FastAPI 适配器
dashboard/desktop_skill_manager/                # 可测试的技能管理领域与基础设施
dashboard/data/builtin_catalog.json             # 内建技能描述
tests/                                          # Desktop 与后端测试
```

## 安全

- 文件操作会验证目标位于当前 Hermes profile 的技能目录内，并拒绝路径任一层的符号链接。
- 同步会拒绝路径逃逸、符号链接和特殊文件，并通过临时目录原子替换目标。
- 删除会物理移除技能目录，当前版本不会创建备份。
- 操作历史保存在 `$HERMES_HOME/state/plugins/desktop-skill-manager.json`。
- 第三方插件会执行本地代码，请只安装可信来源。

## 验证

```bash
node --check desktop-plugins/desktop-skill-manager/plugin.js
node --test tests/desktop_plugin_smoke.test.js
python3 -m unittest discover -s tests -v
```

插件 ID：`desktop-skill-manager` · Desktop 路径：`/desktop-skill-manager` · 版本：`1.3.0`
