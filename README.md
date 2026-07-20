# Hermes Desktop 技能管理

[English](README_EN.md) | 简体中文

`desktop-skill-manager` 是独立的 Hermes Desktop 原生插件，用于查看和维护内建、Skills Hub 与本地技能。它不包含 Hermes Dashboard 页面，也不依赖 Dashboard 插件仓库。

## 功能

- Desktop 侧边栏页面与 `⌘K` 命令入口
- 按来源、分类和状态筛选，支持全文搜索
- 技能详情、最近操作、诊断与自动刷新
- 内建技能重置、删除、恢复；Hub 技能重置、更新、删除；本地技能删除
- 删除和重置要求输入完整技能名确认
- 中英文界面、响应式布局及 Hermes Desktop 主题适配

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

## 目录

```text
desktop-plugins/desktop-skill-manager/plugin.js  # 原生 Desktop UI
dashboard/manifest.json                         # 后端挂载声明（不注册 Dashboard 页面）
dashboard/plugin_api.py                         # 技能管理 API
dashboard/data/builtin_catalog.json             # 内建技能描述
tests/                                          # Desktop 与后端测试
```

## 安全

- 文件操作会验证目标位于当前 Hermes profile 的技能目录内。
- 删除会物理移除技能目录，当前版本不会创建备份。
- 操作历史保存在 `$HERMES_HOME/state/plugins/desktop-skill-manager.json`。
- 第三方插件会执行本地代码，请只安装可信来源。

## 验证

```bash
node --check desktop-plugins/desktop-skill-manager/plugin.js
node --test tests/desktop_plugin_smoke.test.js
python3 -m unittest discover -s tests -v
```

插件 ID：`desktop-skill-manager` · Desktop 路径：`/desktop-skill-manager` · 版本：`1.0.0`
