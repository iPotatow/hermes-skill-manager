<div align="center">

# Hermes Skill Manager

**在一个 Hermes Desktop 原生界面里管理技能，并用软链接在多个 Agent 之间共享同一份 Skill。**

[English](README_EN.md) · 简体中文

</div>

Hermes Skill Manager 是独立的 Hermes Desktop 原生插件，用于查看和维护 Hermes、skills.sh、QwenWork、WorkBuddy 与 Codex 技能。`1.11.0` 起新增 **Agent 链接**：技能文件始终保留在原始目录，其他 Agent 只创建目录软链接，不再通过复制产生多份 Skill。

当前版本：`1.11.0`

## 核心原则

```text
原始 Skill 目录（唯一真实文件）
        │
        ├── symlink → Hermes/skills
        ├── symlink → Codex/skills
        ├── symlink → QwenWork/skills
        └── symlink → WorkBuddy/skills
```

- **文件留在原地**：不会为了共享技能搬迁或复制源目录。
- **任意已发现的真实 Skill 都能作为源**：Hermes、skills.sh、Codex、QwenWork、WorkBuddy 均可作为来源。
- **目标 Agent 只保存软链接**：当前支持 Hermes、Codex、QwenWork、WorkBuddy。
- **不会覆盖真实目录**：目标位置已有同名真实文件或目录时，即使强制确认也拒绝覆盖。
- **解绑只删链接**：不会删除或修改源 Skill。

## 你会得到什么

### 一个入口，查看五套技能来源

- **Hermes**：内建、Skills Hub 社区和本地技能。
- **skills.sh**：读取 `~/.agents/skills` 与全局 `.skill-lock.json` 元数据。
- **QwenWork / 千问办公**：读取 `~/.qwenworkcn/skills`，排除应用内建技能。
- **WorkBuddy**：读取 `~/.workbuddy/skills`，排除应用内建技能。
- **Codex**：读取用户技能并隐藏 `.system` 系统技能。

### Agent 链接

Desktop 侧边栏新增 **Agent 链接** 页面。它把所有可作为真实来源的 Skill 汇总到一张表中，并显示每个目标 Agent 的绑定状态：

| 状态 | 含义 | 操作 |
|---|---|---|
| 原始位置 | Skill 本来就属于这个 Agent | 不操作 |
| 未链接 | 目标目录没有同名项 | 创建软链接 |
| 已链接 | 已指向当前源 Skill | 点击解绑 |
| 其他链接 | 同名软链接指向别处 | 输入完整技能名后重新绑定 |
| 断开的链接 | 同名软链接目标已失效 | 输入完整技能名后重新绑定 |
| 同名真实目录占用 | 目标存在真实文件/目录 | 拒绝自动覆盖 |

例如，一个 QwenWork 中的真实 Skill 可以直接链接到 Hermes 和 Codex；Hermes 本地 Skill 可以同时链接到 Codex、QwenWork 和 WorkBuddy。插件禁止把 Skill 链接回自己的来源 Agent。

### 原有管理能力继续保留

| 来源 | 原有操作 |
|---|---|
| Hermes 内建技能 | 重置、删除、恢复 |
| Hermes 社区技能 | 重置、更新、删除 |
| Hermes 本地技能 | 删除 |
| skills.sh | 搜索、分类、查看来源元数据 |
| QwenWork | 搜索、分类、查看详情、安全删除 |
| WorkBuddy | 搜索、分类、查看详情、安全删除 |
| Codex | 查看、删除用户技能 |

原来的 Hermes → Codex **同步**接口仍然兼容，但实现已经从复制目录改为创建软链接。

## 快速开始

先安装并启用后端：

```bash
hermes plugins install iPotatow/hermes-skill-manager
hermes plugins enable skill-manager
```

再安装 Desktop 文件。`1.11.0` 起 Desktop 入口拆成 `plugin.js` 与 `plugin-core.js` 两个未编译 ESM 文件，因此两者都需要复制：

```bash
HERMES_DIR="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$HERMES_DIR/desktop-plugins/skill-manager"
cp desktop-plugins/skill-manager/plugin.js \
   desktop-plugins/skill-manager/plugin-core.js \
   "$HERMES_DIR/desktop-plugins/skill-manager/"
```

完成后重启 Hermes gateway。若侧边栏没有出现页面，按 `⌘K` 运行 **Reload desktop plugins**。

插件 ID：`skill-manager`  
原管理页：`/skill-manager`  
Agent 链接页：`/skill-manager/links`

## 软链接如何工作

假设真实技能位于：

```text
~/.qwenworkcn/skills/pdf
```

选择“链接到 Codex”后，插件创建：

```text
~/.codex/skills/pdf -> ~/.qwenworkcn/skills/pdf
```

此后修改 QwenWork 原目录中的 `SKILL.md`、脚本或引用文件，Codex 立即看到同一份内容，不需要再次同步。

如果点击“解绑 Codex”，插件只执行目标软链接的 `unlink`；`~/.qwenworkcn/skills/pdf` 不会被删除或改写。

## 安全边界

软链接操作遵循以下规则：

- 源必须是插件已经发现的真实 Skill 目录，并包含有效 `SKILL.md`。
- 不允许用任意用户输入路径作为源，避免路径逃逸。
- 目标只允许是已知 Agent skills 根目录下的直接子项。
- 同名真实文件或目录永不自动删除或覆盖。
- 同名软链接指向其他位置时，必须输入完整 Skill 名确认后才能重新绑定。
- 解绑前再次确认目标确实指向当前源 Skill，只删除链接本身。
- `skills.sh` 的 canonical 目录和 lock file 仍保持只读 ownership；创建 Agent 链接不会改写其 lock file。

普通“删除技能”仍然是来源生态自己的物理删除操作，当前版本不会创建备份；它与“解绑软链接”是两个完全不同的动作。

## 插件更新

页面顶部仍可点击“更新插件”。更新器会先更新 Git checkout，再原子同步 Desktop 文件；如果存在 `plugin-core.js`，会先复制 companion 文件，最后替换 `plugin.js`，避免热加载时出现缺失 import。

Python 后端发生变化后仍需重启 Hermes gateway。

## 架构

```text
desktop-plugins/skill-manager/plugin.js          # Agent Links 扩展入口
desktop-plugins/skill-manager/plugin-core.js     # 原 Skill Manager Desktop UI
dashboard/manifest.json                         # 后端挂载声明
dashboard/plugin_api.py                         # FastAPI 请求适配
dashboard/skill_manager/filesystem.py           # 安全路径、原子文件操作、软链接原语
dashboard/skill_manager/service.py              # 来源解析、绑定/解绑、业务流程
dashboard/skill_manager/inventory.py            # 各生态技能发现
dashboard/skill_manager/skills_sh.py            # skills.sh 只读发现与 lock 元数据
tests/                                          # Desktop 与后端测试
```

## 验证

```bash
node --check desktop-plugins/skill-manager/plugin.js
node --check desktop-plugins/skill-manager/plugin-core.js
node --test tests/desktop_plugin_smoke.test.js
python3 -m unittest discover -s tests -v
```
