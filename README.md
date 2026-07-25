# Hermes 技能管理

[English](README_EN.md) | 简体中文

`skill-manager`（Skill Manager / 技能管理）是独立的 Hermes Desktop 原生插件，用于查看和维护内建、Skills Hub、本地与官方 Optional 技能，并可管理 Codex 用户技能。它不包含 Hermes Dashboard 页面，也不依赖 Dashboard 插件仓库。

版本：`1.8.4`

## 功能

- Desktop 侧边栏页面与 `⌘K` 命令入口
- Dashboard 清单仅挂载后端 API，不注册 Dashboard 侧边栏
- Hermes、Optional 与 Codex 技能均使用紧凑表格展示，不使用技能卡片
- Hermes 与 Codex 使用一级分段视图；Optional 与内建、社区、本地处于 Hermes 来源筛选的同一级
- Optional 清单读取 Hermes 随包提供的官方目录，支持搜索、分类筛选、已安装状态与直接安装；简介随 Desktop 语言切换，并内置完整中文快照
- GitHub Actions 每周统一同步 Hermes 官方内建与 Optional 中文文档；官方译文优先，未收录的新技能保留人工回退，缺失中文时会阻止错误快照提交
- 搜索、来源和分类筛选支持响应式换行、全文搜索和一键清除
- 内建技能中文简介取自 [Hermes 官方中文技能目录](https://hermes-agent.nousresearch.com/docs/zh-Hans/reference/skills-catalog)，跟随 Desktop 界面语言显示，后台定时刷新并保留离线快照
- 技能详情、最近操作、诊断与自动刷新
- 页面顶部提供插件更新按钮，点击后需再次确认；更新成功会自动热加载 Desktop 入口
- 内建技能重置、删除、恢复；Hub 技能重置、更新、删除；本地技能删除
- 社区更新与 Optional 安装使用独立的长请求时限，阻塞型操作由 FastAPI 线程池执行，避免操作期间误报后端连接超时
- 删除社区技能时同时清理界面当前发现的残留副本并刷新发现缓存，避免被重新识别为本地技能
- 删除和重置要求输入完整技能名确认，确认框可一键填入名称
- 内建、社区和本地技能均显示“同步”按钮，可一键同步到 `$CODEX_HOME/skills/<技能名>`；覆盖已有 Codex 技能时要求输入完整技能名确认
- Hermes 主表按“技能、分类、来源、操作”展示，不再显示 Codex 状态；来源类型与具体仓库合并显示，简介位于技能名下方并限制为一行
- Codex 视图标明每个用户技能是“同步于 Hermes”还是“仅 Codex”，同步项同时显示对应 Hermes 来源
- 所有行操作直接显示为按钮，不使用下拉菜单；表格内容垂直居中，首尾列与表头支持粘滞定位
- 操作过程以“确认、执行、刷新”三阶段进度条展示，当前技能行同步显示进行中状态，并保留成功或失败结果
- 顶部汇总已停用、可恢复和诊断数量；“可恢复的内建技能”可按需加入清单
- Codex 视图不显示 `.system` 系统技能，并可直接删除用户技能
- 详情按基本信息、来源与路径分组，支持复制路径、`Esc` 关闭、焦点锁定与返回
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
dashboard/data/builtin_catalog.json             # 官方中文内建技能目录离线快照
dashboard/data/optional_catalog.json            # Optional 技能中文简介离线快照
scripts/sync_builtin_catalog.py                 # 官方目录快照同步工具
scripts/sync_optional_catalog.py                # Optional 官方中文译文同步工具
.github/workflows/sync-skill-translations.yml  # 每周统一同步两份中文快照
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

插件 ID：`skill-manager` · Desktop 路径：`/skill-manager` · 版本：`1.8.4`
