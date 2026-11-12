# Nodeworks 设计文档

> 版本 v0.15 · 2026-11-12 · 状态：P0–P15c 均已实现（多图、子图可视化与直连、映射外置、MCP、可交互缩略图、资源项容器、资产预览、模型通配清单、目录项目）

## 1. 定位

**一句话**：以「单元节点」为基元的内容设计器——图是唯一真源，表格、检查器、导出都只是同一份数据的投影。

目标用户是自己写代码、自己配内容的小团队或个人开发者。典型场景：

- 设计物品、矿物、机器、配方、科技这类互相引用的内容数据；
- 开发过程中反复改数值（价格、功率、产出速率），需要立刻看到"谁受影响"；
- 最终要把数据交付给引擎（UE DataTable / 自定义 json），且交付格式不能随编辑器漂移。

Nodeworks 不试图成为通用节点计算工具（不是 ComfyUI、不是 Shader Graph），也不做引擎运行时。它只解决"内容的结构与数值怎么被设计、审阅、交付"。

## 2. 为什么不是现有形态

| 形态 | 强项 | 致命弱点 |
| --- | --- | --- |
| 表格（Excel / DataTable） | 批量改、排序、diff | 关系不可见；改一个数值不知道影响谁 |
| 蓝图（UE Blueprint） | 表达力强、直观 | 节点一多就不可读；批量编辑几乎不可用；导出契约绑死在引擎里 |
| YAML / DSL | 可 diff、可脚本化 | 非程序员门槛高；看不到结构；校验反馈慢 |
| 纯表单后台 | 简单 | 结构被表单写死，加一个字段要改代码 |

Nodeworks 的取舍是**分工**：

- **图**负责结构与关系（谁产出谁、配比多少、依赖哪些科技）；
- **投影**负责批量与审阅（表格、过滤、影响面）；
- **契约层**负责交付（显式映射到目标格式，而不是让编辑器格式变成交付格式）。

三者读写同一份 `Graph`，不存在"图里改了表格没改"的同步问题。

## 3. 核心概念

| 概念 | 说明 | 关键字段 |
| --- | --- | --- |
| Graph | 一整张图，保存的最小单位 | `version` `nodes` `edges` `kinds` |
| Node（单元） | 一个内容实体，如"钛锭" | `id` `kind?` `title` `props` `ports` `pos` `subgraph?` |
| Port（端口） | 单元的输入/输出通道，决定能怎么连 | `id` `dir` `label` `capacity` `type?` |
| Edge（连线） | 两个端口之间的关系 | `id` `from` `to` `label?` `props?` `orphan?` |
| Prop（属性） | 挂在节点或边上的动态键值 | `value` `type?` `editor?` `unit?` `required?` |
| Kind | 可选的模板标签，用来预填属性/端口 | 字符串，无强制语义 |

### 3.1 六条硬约定

1. **端口 id 稳定**：`id` 生成后不再变；改名只改 `label`。所以重命名不会断线，也不会让历史记录失效。
2. **方向与容量**：连线只能 输出 → 输入；端口 `capacity: 'one' | 'many'` 决定它能接几条线。
3. **删端口不删边**：删端口时把关联边标成 `orphan: true`，边仍留在数据里。UI 显示提示条，可一键清理，且可撤销。
4. **关系的数据属于关系**：配比、速率、概率放 `edges[].props`，不塞回节点。这样同一对节点之间可以有多条语义不同的线。
5. **kind 是模板，不是类型系统**：没有 `kind` 的节点一样合法；`kind` 只用于预填和筛选，不参与结构校验。
6. **属性是动态的**：任意节点可随时增删属性；`type` 只影响编辑器控件与提示，不阻止保存未知类型（按字符串处理）。

### 3.2 为什么这样设计

- **稳定性优先于强类型**：内容设计阶段字段会频繁变；强 schema 会让"加一个字段"变成一次迁移。把约束放在导出契约层，编辑层保持宽松。
- **不静默丢数据**：孤边、未知属性、非法 JSON 值都保留原值并提示，而不是拒绝保存或悄悄删掉。
- **可撤销是底线**：所有写操作都走同一条 `commit` 通道，历史记录成对保存"重做/撤销"函数。

### 3.3 "自由"的边界

"自由"指的是**结构自由**：任何东西都能当节点（物品、机器、配方、科技，甚至"一个想法"），属性随时可加，端口随时可增减，连线不预设语义。

不自由的是四条底层不变量，它们保证自由不会把数据变成一团不可维护的泥：

1. 端口必须有稳定 id（否则改个名就断线，历史记录也失效）；
2. 边必须指向存在的端口（悬空边只能作为 orphan 存在，且可见、可清理）；
3. 图必须可序列化成合法 JSON（没有函数、没有循环引用、没有 undefined）；
4. 所有写操作必须可撤销（不能有"改了但回不去"的路径）。

一句话：**编辑自由，存储守规矩**。


## 4. 数据模型

```jsonc
{
  "version": 1,
  "nodes": [
    {
      "id": "n_3f2a91",
      "kind": "item",
      "title": "钛锭",
      "props": {
        "value": { "value": 9, "type": "number", "unit": "cr" },
        "tier": { "value": 2, "type": "number" }
      },
      "ports": [
        { "id": "p_in_1", "dir": "in", "label": "矿石", "capacity": "many" },
        { "id": "p_out_1", "dir": "out", "label": "钛锭", "capacity": "many" }
      ],
      "pos": { "x": 430, "y": 180 },
      "resources": [
        { "id": "r_9a1", "type": "image", "label": "图标", "path": "assets/icon_ti.png" },
        { "id": "r_9a2", "type": "model", "label": "模型", "path": "assets/titanium.glb" }
      ]
    }
  ],
  "edges": [
    {
      "id": "e_88c1",
      "from": { "node": "n_ore", "port": "p_out_1" },
      "to": { "node": "n_ingot", "port": "p_in_1" },
      "label": "2 : 1",
      "props": { "ratio": { "value": 2, "type": "number" } }
    }
  ],
  "kinds": {
    "item": { "props": ["value", "tier"], "ports": ["in", "out"] }
  }
}
```

- **id**：`n_` / `p_` / `e_` 前缀 + 随机串；只要求图内唯一，不承载语义。
- **子图**：节点可带 `subgraph`（结构与根图完全相同的嵌套 `Graph`）与 `subgraphMap`（父端口 id → `{node, port}` 内部端点）。子图与父图存在同一份文件里，`version` 只在根图出现；进入子图的路径是节点 id 链，历史里记录的操作在提交时抬升到根图。
- **校验**：载入时用 zod 校验 `version`、端口方向、引用存在性；错误信息带路径（`图数据不合法：nodes[3].ports[0].dir`）。
- **持久化**：编辑防抖 250ms 写 `localStorage`；「保存」默认在绑定目录时整份写回、未绑定时下载 `nodeworks.project.json`（`{ version, active, graphs }`）；「打开」默认选项目文件夹，下拉菜单可改选单文件并校验后替换项目（兼容旧单图 `Graph` 文件，清空历史）。
- **资源项**（`node.resources`）：节点上可动态增删的资产登记，每项是 `{ id, type: image|model|audio|other, label, path, meta? }`。图标加一个 `image` 项，模型加一个 `model` 项；文件放 `assets/`，json 里只存相对路径，不内嵌 base64。它和 `props` 分开，因为资源是"外部文件引用"，需要按类型渲染、可挂多个，而 props 是标量/短文本。
- **为什么单文件**：便于 git diff、便于发给别人、便于导出契约做整体校验。资产（图片/模型）放 `assets/` 并以相对路径引用，不进 json。

### 4.1 文件与项目结构

P0 是单图单文件；P7 起是**一个项目一个文件**：

```
nodeworks.project.json  # { version, active, graphs: [{ id, name, graph }] }
assets/                 # 图标、模型等外部资产
export.mapping.json     # 导出契约（P9 起默认读 src/mappings/，可载入自定义）
```

- 项目文件里只存相对路径（`assets/icon_ti.png`），不存 base64，避免 json 膨胀；
- 一个文件 = 一个项目（多张根图 + 共享 kinds），方便 git diff 和发给别人；
- 子图嵌在 `node.subgraph` 里，仍是一个文件，不引入额外目录；子图内资源与根图共用 `assets/`；
- 「打开」仍接受旧的单图 `Graph` 文件，会当作只有一张图的项目载入；
- 导出的 Forgeworks `project.json` 是另一种契约文件，只含引擎表（items/machines/recipes/techs/elements），不含编辑器节点与坐标。

### 4.2 数值、单位与派生值

- `number` 属性 P0 只存字面量；`unit` 只是显示提示（`cr`、`kW`、`s`），不参与计算。
- 派生值（如"电耗 = 功率 × 周期 / 60"）**不在编辑器里求值**：属性可以存一个 `formula` 字符串，由导出契约或 sidecar 解释。理由与 Forgeworks 一致——同一套公式只允许有一份实现，否则前端和交付端迟早对不上。
- 需要即时反馈的派生值（P3 影响面）走 sidecar 请求，不在前端重算第二份。

### 4.3 版本与迁移

- 顶层 `version` 是整数；载入时走 `migrate(raw)` 链式升级（v1 → v2 → …），每一步是纯函数并带单测。
- 遇到**比当前工具更新**的版本：拒绝载入并提示"请升级 Nodeworks"，绝不猜测字段含义。
- 字段废弃不删除：标 `deprecated`，迁移时搬到新字段并保留旧值一个版本，避免用户数据静默丢失。


## 5. 交互设计（P3 现状）

### 5.1 画布

- 滚轮缩放、拖拽平移、框选、`Delete/Backspace` 删除选中节点或连线。
- 连线：从输出口拖到输入口；非法连接不落地，右下角 toast 说明原因（自连 / 重复 / 单条输入口已占用 / 端点不存在）。
- 节点卡片：kind 标签 + 标题 + 前 6 条属性 + 左右端口列。端口标签可重名，靠位置和 id 区分。

### 5.2 检查器

- 选中节点：标题、kind、属性表（键 / 类型 / 值 / 删除）、端口表（方向 / 标签 / 容量 / 删除）、新增属性表单、新增端口按钮、删除节点、模板区（应用 / 存为）。
- 子图节点额外显示「进入子图」与端口映射表（父端口 → 同方向内部端口）；未映射的父端口按未连接处理。
- 只读预览：检查器只显示标题、kind、属性与端口，不渲染编辑控件；画布同时隐藏拖拽、连线、删除与新建。
- 多选：检查器显示选中数量与前 12 个标题；画布顶部浮动工具条提供对齐、分布、复制、删除。
- 选中连线：标签编辑、两端摘要、删除。
- 文本类编辑**失焦或回车才提交**，避免每敲一个字符产生一条历史；布尔值即时提交。

### 5.3 撤销 / 重做

- 命令式历史：每条记录 `{ label, run, revert }`，上限 100 条；`Cmd/Ctrl+Z`、`Shift+Cmd/Ctrl+Z`。
- 拖拽节点在拖动过程中只改位置（不进历史），松手时记一条"移动单元"。
- 删除节点时把节点对象和关联边一起快照进 revert，所以撤销能完整恢复。
- P1 起按 `(实体, 字段)` 合并 500ms 内的连续编辑：同一属性连续输入只留一条历史，撤销回到编辑前的值；超时或换字段则另起一条。

### 5.4 空态与错误

- 未选中：检查器给一句引导，不显示空表单。
- 非法 JSON 属性：不写回、不报错弹窗，等用户继续编辑。
- 孤儿边：底部提示条「有 N 条孤儿边」+「全部删除」，可撤销。

### 5.5 搜索、大纲与过滤

- 左侧大纲树：按 `kind` 分组，展开显示节点标题；点击定位并选中。组内按标题排序，未分类排最后。
- 搜索框：匹配标题、`id`、`kind`、属性名/值；结果高亮，`Enter` / `Shift+Enter` 跳转下一个/上一个，画布上其余节点淡出。
- 过滤器：只看某些 kind、只看孤立节点（无非孤儿连线）、只看孤儿边关联节点；过滤时隐藏不匹配节点，而不是仅仅淡出。
- 命令面板（`Cmd/Ctrl+K`）：新建（含按模板）、跳转节点、保存/打开、适应视图、撤销/重做、复制/粘贴、应用模板、清理孤儿边、删除选中。
- 大图靠"过滤 + 搜索 + 子图"三件套，而不是靠无限缩小画布。
- 子图：双击带子图的节点进入，画布左上出现「根图 / … / 当前层」面包屑，可逐级返回；进入后可编辑，点「只读预览」隐藏编辑能力防止误改，退出预览恢复。

### 5.6 影响面（P3）

- 选中节点后高亮上下游 N 层（默认 2 层），其余淡出；
- 改数值前预览：列出直接依赖、二层依赖、受影响的物品/配方数量（口径与 Forgeworks `content/impact` 一致）；
- 影响面只做"读"，不自动改下游数值——自动改是求解器的事，不是编辑器的默认行为。

### 5.7 表格投影（P3）

- 顶部「图 / 表格」切换；表格与画布共享同一份图、同一套选择与撤销栈，行选中即画布选中。
- 列：标题、kind、属性并集（按名排序）、端口数（只读）；表头点击排序，同列再点切换升降序，数字列按数值比较，缺失值恒排最后。
- 按 `kind` 分组可开关，`未分类` 组排最后；行内编辑失焦/回车提交，`Esc` 取消；双击行回到画布并定位该单元。
- 选中多行出现批量条：属性名 / 类型 / 值一次写入全部选中节点，只记一条历史，撤销恢复各节点旧值或缺失。
- 列显隐菜单只影响表格视图，不删除属性数据。


## 6. 架构

```
src/
  model/       types / schema / sample / ops / history / layout / clipboard / query / path / table / impact /
               project / folder / preview / autolayout / mapping / cross / modelTemplate
  fs/           types / memory / disk —— 目录项目抽象（内存实现用于测试，磁盘实现走 File System Access API）
  store.ts     zustand：图 + 历史 + 选择 + 过滤 + 剪贴板 + 面板状态 + 视图/影响面 + 项目/目录绑定 + toast
  components/  UnitNode / Toolbar / Inspector / OrphanBanner / Sidebar / CommandPalette /
               MultiBar / ReconnectWizard / Breadcrumbs / TableView / ImpactPanel /
               ExportDialog / SnapshotDialog / CrossLinkDialog / BoundaryNode / AssetPreview
  persistence.ts  localStorage + 文件下载/读取
  App.tsx      画布装配、多选拖动、快捷键、自动保存
```

- **纯前端**：目前没有后端。所有校验是本地纯函数，秒回。
- **ops 是纯函数**：`addNodeOp(graph, node) -> graph`，不 mutate、不碰 React、不碰存储。好处是可单测、可被未来的 CLI / sidecar 复用、可做图 diff。
- **store 只管编排**：捕获旧值 → 组装 `run/revert` → `commit`。组件不直接改 graph。
- **历史用闭包而不是 diff**：实现简单、行为可预测；代价是内存（上限 100 条兜底）。
- **渲染层用 React Flow 的受控模式**：节点/边每次由 graph 派生，拖动时先写临时位置，松手再进历史。

### 6.1 与 Forgeworks 的关系

- 独立仓库、独立前端，不复用 Forgeworks 的 vanilla JS 与视图层。
- Forgeworks 的 `tools/fwcore/`（规则校验、物料平衡、产线求解、影响面、导入 gate）作为**参考实现与未来 sidecar**：Nodeworks 通过 localhost API 调用，不在前端重算第二份。
- P4 的导出契约以 Forgeworks `project.json` 作为第一个目标格式，用来对拍旧工具的输出。

### 6.2 从旧项目导入（反向迁移）

导出契约只解决"新 → 旧"。真正切换工具时还需要"旧 → 新"：

- `import.mapping.json` 与导出映射共用一套字段表（双向）；
- 导入先 dry-run：列出无法映射的字段、丢失的引用、会被合并的重复 id；
- 导入结果不直接覆盖当前图，而是生成一张新图让用户对比后再保存；
- 对拍标准：同一份旧项目，导入再导出后与原始 `project.json` 做归一化 diff（忽略键序、浮点尾差）。

### 6.3 关键建模决策：配方是节点还是边？

这是整个数据模型里最容易走错的一步，明确写下来：

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 配方 = 边（item → item，配比在边 props） | 图最简，链式关系一眼看懂 | 只能表达 1:1；多输入/多输出会变成超边；机器、周期、功率无处安放 |
| 配方 = 节点（item → recipe → item） | 天然支持多输入多输出；机器/周期/功率是节点属性；科技解锁可以连到配方 | 节点数变多；简单链条也要三个节点 |

**决定：正式内容用"配方 = 节点"**，边上只放"消耗/产出数量"这类属于关系的数值。理由：

1. Forgeworks 的配方本来就是一等实体（`recipes[]` 有 inputs/outputs/machine/cycle/power），压成边会丢信息；
2. 多输出配方（副产物）用边表达会变成超边，React Flow 和导出都要特殊处理；
3. 科技解锁、机器适配都是"指向配方"的关系，配方是节点才能自然连接。

P0 示例图用的 `钛矿 → 钛锭`（边标签 `2 : 1`）只是**链的简化投影**，用于验证连线与配比标签机制，不代表正式建模方式。P4 导入旧项目时按"配方 = 节点"生成。


## 7. 里程碑

### P0（已完成，2026-11-09）

范围：画布 / 单元节点 / 动态属性 / 动态端口 / 连线校验 / 删除与孤儿边 / 撤销重做 / localStorage / 文件存取 / 示例图。

验收：

- `pnpm test` 12 项通过（连接校验 5、结构操作 4、序列化 3）；
- `tsc --noEmit` 干净；`vite build` 成功（gzip 约 126 kB）；
- 浏览器实测：3 节点渲染、点击选中后检查器显示标题/kind/属性、新增属性「硬度=7」成功、新建单元后撤销回到 3 个。

### P1（已完成，2026-11-09）

范围：重连向导、多选与对齐/分布/复制粘贴、命令面板、大纲搜索与过滤、kind 模板、属性历史合并。

验收：

- `pnpm test` 51 项通过（ops 12、schema 3、history 5、layout 9、clipboard 4、query 8、store 10）；
- `tsc --noEmit` 干净；`vite build` 成功（JS gzip 133.70 kB、CSS gzip 5.18 kB）；
- 浏览器自动化：Playwright（playwright-core 1.65 + 本机 Chrome）11 项冒烟连续 3 轮通过——首屏 3 单元 2 边、点选后检查器、命令面板跳转、大纲搜索与 `Enter` 跳转、多选对齐 + 撤销、删端口重连向导 + 保留孤儿 + 撤销、模板新建、复制粘贴、`Delete` + 撤销、只看孤立过滤、控制台无错误。
- 实测中发现并修复 3 个回归：受控 `nodes` 未接 `onNodesChange` 导致点选失效；受控节点重建丢失 `measured` 导致连线不渲染；`onEdgesDelete` 先于 `onNodesDelete` 触发导致删节点被拆成两条历史。

实现要点：

- 重连向导：删端口时若有连线，先挂起，向导提供「改接到已有端口 / 新建同名端口 / 保留为孤儿边 / 删除端口和边」；改接会去重，单条输入口的非法改接会被候选过滤挡住。
- 多选：画布整组拖动、`Shift` 框选；工具条对齐（左/中/右/上/中/下）、等距分布（需 ≥3 个）、复制、删除。
- 剪贴板：只复制选区内部连线，粘贴时节点/端口/边全部换新 id 并偏移 32px；连续粘贴递增偏移。
- 模板：`kinds` 带默认属性与端口，新建节点/应用模板只补缺省值，不覆盖已有属性；可把当前节点「存为模板」。
- 历史合并：500ms 内同 `(实体, 字段)` 连续编辑合并为一条。

### P2（已完成，2026-11-11）

范围：`node.subgraph` 嵌套 `Graph`、双击进入与面包屑、父端口 ↔ 内部端点映射、只读预览。

验收：

- `pnpm test` 67 项通过（在 P1 的 51 项上新增 path 7、schema 递归/映射 2、子图 store 7）；
- `tsc --noEmit` 干净；`vite build` 成功（JS gzip 135.77 kB、CSS gzip 5.34 kB）；
- 浏览器自动化：Playwright 子图冒烟 10 项通过——新建子图单元、双击进入（层内 0 单元）、层内新建只改子图、只读预览禁用编辑、退出预览恢复、层内撤销、面包屑回根、子图内撤销其创建自动退回根图、控制台无错误；P1 的 11 项冒烟同步回归通过。

实现要点：

- 路径化提交：store 用 `path: string[]` 表示当前层，读写走 `graphAtPath` / `updateAtPath`；历史里存的始终是根图操作，子图内编辑与撤销不需要单独的历史栈。
- 撤销导致当前路径失效时自动退回最近的可用父层，并清空选择与待处理端口。
- 子图是完整 `Graph`（自带 `kinds` 副本），复制/校验/序列化复用同一套代码；端口映射在 schema 里校验存在性与方向。
- 预览只关编辑入口（拖拽、连线、删除、新建、撤销/复制/粘贴命令），不另存一份只读数据。

### P3（已完成，2026-11-11）

范围：表格投影（按 `kind` 分组、按属性列排序/过滤、单元格编辑、批量改、列显隐）、影响面面板（上下游 N 层高亮 + 受影响清单，只读）。

验收：

- `pnpm test` 90 项通过（11 个文件；P3 新增 table 8、impact 6、store 表格/影响面 6，另含此前端点归一化 3 项）；
- `tsc --noEmit` 干净；`vite build` 成功（JS 449.48 kB / gzip 140.51 kB，CSS 31.48 kB / gzip 6.18 kB）；
- 浏览器自动化：Playwright P3 冒烟 9 项通过——影响面面板计数与高亮、切换到表格（3 行）、按 value 升降序、单元格编辑 + 撤销、批量改 tier + 撤销、列显隐 + 恢复、双击行回画布、控制台无错误；P1 的 11 项与 P2 的 11 项冒烟同步回归通过。

实现要点：

- 表格与画布共享 `selectedNodes` 与 `commit`：行选中直接写 store，批量改走 `setPropMany`（一条历史，保留旧 meta 的其它字段）。
- `table.ts` 负责列并集、单元格文本、类型解析、排序（缺失值恒最后）、过滤与分组；表格只是投影，不改数据结构。
- `impact.ts` 双向 BFS（默认 2 层，可调 1–5），跳过孤儿边、环安全；画布高亮相关节点/边，其余淡出；面板按层列出清单，只读派生，不写回图。
- 视图状态（`view`、`impactOn`、`tableSort`、`hiddenColumns`、`focus`）存在 store，不进撤销历史；`focus` 由画布消费后立即清空。

### P4（已完成，2026-11-11）

范围：`export.mapping.json`（节点 kind → 目标表/字段，属性名 → 列名，边 → 关系表）、导出前 dry-run、Forgeworks `project.json` 对拍、反向导入器 + dry-run。

验收：

- `pnpm test` 99 项通过（12 个文件；P4 新增 mapping 9 项）；
- `tsc --noEmit` 干净；`vite build` 成功（JS 458.64 kB / gzip 143.95 kB，CSS 32.50 kB / gzip 6.42 kB）；
- 浏览器自动化：Playwright P4 冒烟 12 项通过——导出对话框与目标名、表计数、未映射属性告警、无错误可导出、下载文件名、命令面板入口、反向导入（4 单元 / 3 连线）、往返后 dry-run 无错误、无 console error；P1 11 项、P2 11 项、P3 9 项回归通过。

实现要点：

- `src/model/mapping.ts`：`ExportMapping` 描述节点表映射与四种边规则（recipe-input / recipe-output / runs-on / unlocks）；`exportProject` 同时产出目标 JSON 与 dry-run 报告，`importProject` 反向建图并用 zod 复验。当前映射以 `FORGEWORKS_MAPPING` 常量表达，后续可原样抽成 json。
- 业务 id：优先 `key` 属性（`ORE_TI`），没有则退回图内 id；导入时保留业务 id，冲突改为新 uid，保证对拍稳定。
- dry-run 分级：缺 kind 映射、未映射属性、孤儿边、未匹配边规则只告警；业务 id 重复、必填缺失（配方无 machine）、连线端点落不了表为错误，错误未清零不允许导出。
- 导入端：按表建节点（常量端口 `p_in` / `p_out`、网格坐标），`inputs/outputs/machine/unlocks` 反向还原成边；未知字段告警，悬空引用报错，最后统一走 `GraphSchema.parse`。
- UI：Toolbar「导出…」、命令面板「导出契约（dry-run）」「导入 project.json…」；`ExportDialog` 展示表计数与分级问题列表，导入有错时保留列表不载入。

### P5：自动布局（已完成，2026-11-11）

范围：按依赖关系把当前层重新分层排布，一次提交、可撤销；不改图结构，只改坐标。

验收：

- `pnpm test` 107 项通过（13 个文件；P5 新增 autolayout 7、store 布局提交 1）；
- `tsc --noEmit` 干净；`vite build` 成功（JS 462.00 kB / gzip 145.29 kB，CSS gzip 6.42 kB）；
- 浏览器自动化：Playwright 5 项通过——点「自动布局」坐标重排、4 个节点互不重叠、⌘Z 回原位、命令面板可搜索、无 console error。

实现要点：

- `src/model/autolayout.ts`：DFS 标记回边 → DAG 上 Kahn 求最长路径层级 → 层内前驱/后继重心排序（3 轮上下扫描）→ 层间横向排开、层内纵向居中；孤立节点单独排在下方三列网格。
- 尺寸优先用实测值，缺省按属性行/端口行估高（`estimateSize`），保证层内不叠；坐标取整并归一化到 `padding`。
- store 的 `autoLayout()` 走 `moveNodes(..., '自动布局')`，整次布局只有一条历史；预览态下按钮禁用。
- 入口：工具栏「自动布局」、命令面板「自动布局（分层）」、`⌘⇧L`。

### P6：版本快照与回滚（已完成，2026-11-11）

范围：把整张图存成本地快照，能对比当前差异、一键回滚并撤销；不做云同步、不做逐条命令日志。

验收：

- `pnpm test` 118 项通过（14 个文件；P6 新增 snapshot 7、store 快照 4）；
- `tsc --noEmit` 干净；`vite build` 成功（JS 468.61 kB / gzip 147.42 kB，CSS gzip 6.62 kB）；
- 浏览器自动化：Playwright 9 项通过——空态、保存快照、改图后显示差异明细、回滚、⌘Z 撤销回滚、刷新后仍在、删除、Esc 关闭、命令面板入口、无 console error。

实现要点：

- `src/model/snapshot.ts`：`Snapshot{id,at,label,graph}`；`newSnapshot` 深拷贝整张根图；`loadSnapshots/persistSnapshots` 读写 `localStorage` 的 `nodeworks.snapshots.v1`（最多 20 份，超大或损坏的条目跳过）；`diffGraphs` 按节点 id / 边端点比对，输出增删改、移动、标题与属性变化明细。
- store：`snapshots`、`snapshotOpen`；`takeSnapshot(label?)`（默认名带时间）、`restoreSnapshot(id)`、`deleteSnapshot(id)`。
- 回滚先退出子图层，再用**一条**历史整体替换根图，所以 ⌘Z 能撤销回滚；回滚不改文件、不自动保存快照。
- UI：工具栏「快照…」、命令面板「快照与回滚…」「保存当前快照」；对话框内保存、查看差异明细、回滚、两步删除、Esc 关闭。

### P7：多图容器（已完成，2026-11-11）

范围：一个 project 管多张根图，kinds 模板共享；侧栏切换、重命名、删除；数据落在同一个 `nodeworks.project.v1`（应用）或 project.json（文件）。

验收：

- `pnpm test` 127 项通过（含 project 6、store 多图 3）；`multigraph.mjs` 9 项浏览器冒烟通过；
- 切换图重置历史/选择/子图路径，重新打开项目仍停在最后一张图；
- 至少保留一张图，删除当前图会切到第一张。

实现要点：`src/model/project.ts` 的 `ProjectDoc/ProjectGraph`、`mergeKinds/unifyKinds`、`projectFromGraph`、`addGraph/switchGraph/renameGraph/removeGraph`；`parseProjectDoc` 逐图用 `GraphSchema` 校验；store 的 `projectGraphs/activeGraphId` 与 `switchGraph/addGraph/renameGraph/removeGraph`。

### P8：子图卡片缩略图与跨层接线（已完成，2026-11-11）

范围：子图卡片内画出内部结构的缩略图；进入子图后，父层端口以代理端口浮在画布两侧，直接拖线即可建立映射。

验收：

- 缩略图按内部节点包围盒等比缩放，单节点收成小色块，空子图有占位；缩略图可交互：滚轮缩放、拖动平移、点击小方块进入子图并选中该单元，滚轮不会穿透缩放画布；`preview.test.ts` 5 项 + `minimap.mjs` 7 项通过；
- 子图层左右各一组「外层输入/输出」代理，拖线调 `setOuterMap` 写父节点 `subgraphMap`，撤销回到父层历史；`cross.mjs` 9 项通过。

实现要点：`miniPreview`（estimateSize + 缩放 + kind 颜色 + 节点 id）；`UnitNode` 内的缩略图维护 `{tx,ty,k}` 视图变换，原生非 passive wheel 监听；`BoundaryNode` 合成节点与 `__map:` 虚线；App 的 `onConnect` 命中代理时走映射而非普通连线。

### P9：导出映射外置（已完成，2026-11-11）

范围：映射从代码常量移到 `src/mappings/forgeworks.mapping.json`，可在导出对话框里下载、载入自定义映射、恢复默认。

验收：`validateMapping` 校验版本/表名/titleField/edges.store 等；映射存 `nodeworks.mapping.v1`，无效文件不改当前映射；导出对话框 3 个映射操作按钮；137 项单测通过。

### P10：MCP 服务（已完成，2026-11-11）

范围：stdio MCP server，让 AI 直接读写 project.json，完成看图、建模板、增删单元/连线、自动布局、导出与校验。

工具（19 个）：`project_info`、`get_graph`、`create_graph`、`set_active_graph`、`define_kind`、`find_nodes`、`add_node`、`update_node`、`remove_nodes`、`add_edge`、`remove_edges`、`auto_layout`、`export_project`、`validate_project`、`list_snapshots`、`create_snapshot`、`restore_snapshot`、`delete_snapshot`、`undo`。

映射与快照：`export_project` 接受 `mapping`（相对项目文件），默认取 `--mapping` / `NODEWORKS_MAPPING`，都没有才用内置映射；快照为文件级，存在 `<project>.snapshots.json`，最多 20 份，回滚整体替换项目并可用 `undo` 退回。

实现要点：`mcp/server.ts` 复用 `src/model/*`（不复制逻辑），按 project.json 读写，写前记录 50 步内存撤销栈；`pnpm build:mcp` 用 esbuild 打成 `mcp/server.mjs`；应用「打开」已支持 project 文档（`store.loadFile` + `parseProjectDoc`）。

已知限制：应用不监听外部文件变化，AI 改完后需要在应用里重新「打开」；MCP 快照与编辑器 localStorage 快照彼此独立。

### P11：跨子图直连（已完成，2026-11-11）

范围：两个子图内部的节点直接互连（不经过手动建端口/映射）；在子图层把输出端口拖到「连接到其它子图…」落点，选目标内部输入端口即可。

验收：

- 自动在两边子图卡片上创建外层端口并写 `subgraphMap`，根层生成一条普通边；整次操作一条历史可撤销；
- 进入任一侧子图能看到内部节点到外层端口的虚线映射，根图看到两张卡片之间的实线；`cross.mjs` 9 项通过；
- `pnpm test` 143 项通过（17 个文件；新增 cross 3、preview id 1、外层代理位置 2）；`tsc` 干净；`vite build` 成功（JS gzip 153.51 kB、CSS gzip 7.09 kB）。

实现要点：`src/model/cross.ts` 的 `crossTargets/planCrossLink`（合成 addPortOp + setSubgraphMapOp + addEdgeOp，纯函数可测）；store 的 `linkCrossSubgraph` 单条历史；`CrossLinkDialog` 只列其它顶层子图内部的输入端口；子图层 `__cross__` 合成落点节点。

### P12：资源项容器（已完成，2026-11-12）

范围：单元检查器在「属性」和「端口」之间增加资源区，可动态添加图片/模型/音频/其它项，编辑类型、名称、相对路径，删除可撤销。

验收：

- 资源项写进 `node.resources`，刷新/保存/打开/子图嵌套都能保留；schema 校验类型枚举与字段形状；
- 增删改各走一条历史，文本编辑 500ms 内合并；`resources.test.ts` 4 项、浏览器 `resources.mjs` 15 项通过；
- `pnpm test` 147 项通过（18 个文件）；`tsc` 干净；`vite build` 成功（JS gzip 154.32 kB、CSS gzip 7.12 kB）。

实现要点：`src/model/ops.ts` 的 `createResource/addResourceOp/setResourceOp/removeResourceOp`；store 的 `addResource/setResource/removeResource`；Inspector 只登记路径不碰文件，文件仍放 `assets/`。

### P13：资产预览（已完成，2026-11-12）

范围：资源项旁「◎」打开预览。图片按路径显示；模型用 three.js 在模态里旋转/缩放/平移查看，同时展示节点树、材质参数与贴图缩略图；也可以选择本地文件，预览还没部署到站点上的资产。

验收：

- 图片：路径可读则直接显示；读不到时提示并允许选本地图片；预览本身不写回路径、不改图。
- 模型：GLB 与内嵌资源的 glTF 可解析；显示节点树（组/网格/骨骼/灯光）、材质（基础色、金属度、粗糙度、自发光、透明、双面）与各贴图槽缩略图，以及节点/网格/三角面/材质/贴图统计；有动画时可播放，支持自动旋转。
- 交互：左键拖动旋转、滚轮缩放、右键平移；Esc 或点击背景关闭。
- 依赖 three 通过动态 `import()` 懒加载，主包不包含 three。
- `preview.mjs` 8 项通过；`pnpm test` 148 项通过（18 个文件）；`tsc` 干净；`vite build` 主包 JS gzip 158.86 kB，three 单独 chunk gzip 191.20 kB（仅打开模型预览时加载）。

实现要点：`src/components/AssetPreview.tsx` 的 `assetUrl` 与三种面板；`ModelPane` 动态 import `three` / `GLTFLoader` / `OrbitControls`，本地文件走 `loader.parse(arrayBuffer)`；贴图缩略图从 `texture.image` 绘到 48px canvas；节点树用原生 `<details>`。

已知限制：`.gltf` 的外部贴图/二进制需要同路径可访问，否则只显示几何与内嵌资源；贴图暂不能按通道（R/G/B）单独查看。

### P14：模型资源通配清单（已完成，2026-11-12）

范围：把「非白模最低配」固化成引擎无关的通配模板——`mesh`（模型文件，含网格与材质）+ `basecolor` / `normal` / `orm` 三张基础贴图；角色额外标记骨骼/蒙皮/动画；场景件额外补 `lod` 与 `collision`。检查器资源区直接显示清单与缺失项。

验收：

- 空节点显示「缺 4」，一键补齐 4 项资源；勾选「角色」后把 `meta.rigged` 写到 mesh 资源，勾选「场景件」再补 LOD 与碰撞；
- 已有资源即使没有 `slot` 字段，也能按标签/路径（`basecolor`、`albedo`、`normal`、`法线`、`orm`、`lod`、`collision`、`UCX_` 等）推断槽位，不重复补；
- 整次套用一条历史可撤销；再次套用只改标记、不增加条目；
- `modelTemplate.test.ts` 7 项、浏览器 `modeltpl.mjs` 6 项通过；`pnpm test` 155 项通过（19 个文件）；`tsc` 干净；`vite build` 主包 JS gzip 160.34 kB、CSS gzip 8.11 kB。

实现要点：`src/model/modelTemplate.ts` 的通配表、槽位推断与清单状态；store 的 `applyModelTemplate` 一次 `replaceNodeOp` 提交；Inspector 的 `ModelTemplate` 区块（缺项、可选组、两个勾选项）。角色骨骼/动画不落成文件，只记在 mesh 的 `meta.rigged`。

### P15a：目录项目（已完成，2026-11-12）

范围：项目以文件夹为权威数据，「存为目录」把整份 project 写成 `project.json` + 每图一个目录 + 每节点一个目录；之后每次提交（含撤销/重做）防抖 300ms 全量回写；「打开目录」从文件夹恢复。

目录结构：

```
project.json                       # version / active / kinds / graphs:[{id,name,dir}]
graphs/<图名>__<图 id>/
  graph.json                       # nodeOrder + edges + 图级元数据
  nodes/<节点标题>__<节点 id>/
    node.json                      # 节点（不含 subgraph）
    subgraph/graph.json            # 递归子图
```

验收：

- 写出 `project.json`、`graph.json`、三个 `node.json`；加节点立即多一个目录，改标题目录随之改名，删节点/删图清理旧目录；
- 手工重命名文件夹后仍按 `node.json` 里的 id 读回；缺 `project.json` 的目录给出明确提示；
- 刷新后「打开目录」恢复同样的节点/连线/子图/资源；绑定后在侧栏显示目录名，可一键取消绑定；
- 只在 Chromium 系浏览器可用（`showDirectoryPicker`）；没有文件监听，外部改动需要重新打开；同一目录不要同时开两个窗口。

验证：`folder.test.ts` 6 项、浏览器 `folder.mjs` 5 项通过；`pnpm test` 162 项通过（20 个文件）；`tsc` 干净；`vite build` 主包 JS gzip 163.11 kB、CSS gzip 8.21 kB。

实现要点：`src/model/folder.ts` 的读写、目录名 slug 与孤儿目录清理；`src/fs/disk.ts` 把 `TypeMismatchError` / 缺失父目录都按「不存在」处理；store 的 `saveToFolder/openFolder/unbindFolder` 与模块级防抖同步。

已知限制：资源文件尚未复制进 `resources/`（P15b）；目录句柄不持久化，重开应用要重新选择；MCP 仍按单文件 project.json 工作。

### P15b：资源文件落盘（已完成，2026-11-12）

范围：资源项除了登记 `path`（给引擎用的逻辑路径），目录项目还要把字节本身放进节点文件夹的 `resources/`，用 `file` 记录相对路径；之后打开目录仍能拿到文件。

验收：

- 检查器资源行「⇧」选本地文件 → 写入内存待落盘队列，`path` 变成 `assets/<原文件名>`；点「存为目录」（已绑定则直接同步）后文件出现在 `nodes/<标题>__<id>/resources/`，`node.json` 的 `resources[].file` 指向它；
- 已绑定目录时再点「存为目录」不再弹选择器，直接回写并提示「已同步到…」；
- 资源字节拿不到（路径不可访问）时保留已有文件与 JSON，不报错阻断；
- 自动同步（300ms 防抖）只写 JSON，不重复抓取资源；显式保存才复制字节；
- 未被引用的旧资源文件在带 `readResource` 的写入里被清理。

验证：`folder.test.ts` 8 项、浏览器 `folder.mjs` 6 项通过；`pnpm test` 164 项通过（20 个文件）；`tsc` 干净；`vite build` 主包 JS gzip 163.70 kB、CSS gzip 8.22 kB。

实现要点：`src/model/folder.ts` 的 `WriteOptions.readResource`、`resourceFileName`、resources 目录清理；store 的 `importResourceFile`（内存 `resourceFiles`）与 `saveToFolder` 的 fetch/File 读取；Inspector 的 `.file-pick`。

已知限制：预览仍按 `path` 走站点 URL，不直接读目录里的 `file`；导出契约不看 `file`；资源复制只在显式保存时发生。

### P15c：目录重载与 MCP 目录模式（已完成，2026-11-12）

范围：目录项目没有文件监听，外部改动（手改、git pull、AI 写盘）后可以手动重载；MCP 也能直接读写目录项目，而不是只能操作单文件。

验收：

- 侧栏目录条新增「↻」：重新 `readProject` 并替换当前项目，历史/选择清空；外部改 `node.json` 的标题后点 ↻，画布与大纲立即更新；
- MCP `--file` 指向一个**已存在的目录**时进入目录模式：启动时 `readProject`，每次写操作 `writeProject` 整份回写，快照存 `<目录>/snapshots.json`；`add_node`/`undo`/`validate_project`/`export_project` 全链路通过；
- 单文件模式（`--file xxx/project.json`）行为不变，原 mcp2 回归全过；
- 资源预览优先读绑定目录里的字节：`AssetPreview` 传 `nodeId`，按 `graphs/…/nodes/<nodeDir>/<resource.file 或 resources/resourceFileName>` 读取并转 blob URL，读不到才退回站点路径；导入资源后无需重新打开即可预览。

验证：`folder.mjs` 8 项、`mcp-folder.mjs` 通过；`pnpm test` 164 项（20 个文件）；`tsc` / `typecheck:mcp` 干净；`vite build` 主包 JS gzip 164.11 kB。

实现要点：store 的 `reloadFolder`；`mcp/node-fs.ts` 的 `NodeFS`（把 Node fs 适配成 `ProjectFS`）；`mcp/server.ts` 的 `FOLDER_MODE`、异步 `persist/mutate` 与按行串行处理的请求队列。

已知限制：仍然没有文件监听（浏览器不允许），重载是手动的；MCP 目录模式只写 JSON、不复制 `resources/` 字节；MCP 的撤销栈只在当前会话；目录资源预览只覆盖当前层节点（子图内部节点的资源仍按站点路径）。

### 之后（未排期）

只读分享页、协作、快照导出为文件、端口类型强约束、嵌套子图互连（当前跨子图直连限于顶层兄弟子图）、视频/字体预览、贴图通道检查、按引擎细化通配清单（UE/Unity/Godot）。

## 8. 非目标

- 不做引擎运行时、不做游戏逻辑执行；
- 不做美术资源生产（图标/模型由外部工具生成后登记）；
- 不做多人实时协作（P0–P4 都是单机文件）；
- 不做通用节点计算（数学/着色器节点库不在范围内）；
- 不做账号/云存储。

## 9. 风险与对策

| 风险 | 表现 | 对策 |
| --- | --- | --- |
| 图变大后不可读 | 几百节点挤在一起 | 子图折叠、按 kind 着色、搜索定位、P3 表格兜底、P5 自动布局 |
| 动态属性漂移 | 同一 kind 的字段越加越乱 | kind 模板只做预填；P4 契约层显式列出未映射字段 |
| 撤销历史内存 | 大图 × 100 条 | 上限 + 只快照受影响子图（P1） |
| 单机数据丢失 | localStorage 被清 | 自动存 + 显式下载 + 建议放 git 仓库 |
| 契约层与编辑器耦合 | 导出逻辑散落 | 映射文件独立、可测试、dry-run 先看 diff |
| 旧项目导入失真 | 字段丢失、引用错位 | 双向映射表 + dry-run + 导入后对拍 diff |
| 大图渲染卡顿 | 300+ 节点拖动掉帧 | 目标 300 节点 / 800 边拖动 ≥ 50fps；必要时只渲染视口内节点 |

## 10. 开放问题

1. 端口要不要"类型"强约束？当前只做提示（`type` 字段保留），担心过早引入类型系统拖慢内容迭代。
2. 边上的 props 由谁定义 schema？候选：kind 模板里声明 `edgeProps`，或契约层单独声明。
3. 子图的 id 作用域：全局唯一还是子图内局部 + 路径前缀？影响复制/粘贴与导出。
4. 是否需要"只读分享"（导出静态 HTML）？暂不做。
5. 与 Forgeworks 的双轨期多长：P4 完成前，旧工具仍是交付主路径。
6. 节点 id 用业务 id（`ORE_TI`）还是随机 id？前者便于与旧项目对拍、导出稳定；后者便于复制粘贴。倾向：导入时保留业务 id，新建时随机。
7. "项目 / 多图"容器什么时候需要：主图 + 子图 + 共享资产，是否要一个 `project.json` 包住多张图。
8. 公式求值放在哪：导出时算（简单）、sidecar 算（一致）、还是引入表达式库（灵活但引入第二套语义）？
9. 本地化：`title` 是显示名还是 key？游戏通常需要"稳定 key + 多语言显示名"，当前只有 `title`，是否加 `key` 字段。

## 附录 A：Forgeworks `project.json` → Graph 映射草案

P4 的导入/导出都按这张表实现；节点 id 优先沿用业务 id（`ORE_TI`、`R_SMT_FE`），保证对拍稳定。代码里以 `src/model/mapping.ts` 的 `FORGEWORKS_MAPPING` 为准（与下表一一对应）。

| 旧结构 | 新图 | 说明 |
| --- | --- | --- |
| `elements[]` | `kind: "element"` 节点 | 属性：`color` `icon`；无端口 |
| `items[]` | `kind: "item"` 节点 | 属性：`tier` `type` `value` `color` `icon` `mesh` `mat` `modelStatus` |
| `machines[]` | `kind: "machine"` 节点 | 属性：`footprint` `icon`；配方通过 `runs on` 边连入 |
| `recipes[]` | `kind: "recipe"` 节点 | 属性：`cycle` `power`；每个输入/输出物品一个端口 |
| `techs[]` | `kind: "tech"` 节点 | 属性：`cost` `time`；`unlocks` 边指向配方 |
| 配方 `inputs[]` | `item → recipe` 边 | 边属性 `amount`；边标签显示数量 |
| 配方 `outputs[]` | `recipe → item` 边 | 边属性 `amount` |
| 配方 `machine` | `recipe → machine` 边 | 标签 `runs on` |
| 科技 `unlocks[]` | `tech → recipe` 边 | 标签 `unlocks` |
| `assets.icon/mesh` | 节点属性里的相对路径 | 指向 `assets/`，不内嵌 base64 |

导出时反向执行，并在 dry-run 中列出：未映射属性、缺失必填（如配方没有 machine）、悬空引用（边指向不存在的物品）。

## 附录 B：术语

- **单元（Unit）**：图上的一个节点，代表任意内容实体或概念。
- **投影（Projection）**：同一份图的另一种视图（表格、大纲、影响面），不是副本。
- **孤儿边（Orphan）**：端口被删除后遗留的边，保留但不可见地参与导出，直到被清理。
- **契约（Contract）**：图到交付格式的显式映射，独立于编辑器内部结构。
