# Nodeworks

以「单元节点」为基元的内容编辑器（设计文档见 [docs/design.md](docs/design.md)）：每个节点自带动态属性、可变输入/输出端口，
节点之间用连线组成图；图是唯一真源，表格/导出都只是投影。

## 运行

```bash
pnpm install
pnpm dev
```

然后打开 Vite 打印的地址（默认 http://127.0.0.1:5173）。

## 已实现（P0–P15b）

- 画布：缩放、平移、框选、小地图、适应视图（React Flow）
- 单元节点：标题、`kind` 标签、动态属性、动态端口、资源项容器
- 属性：任意增删，类型 `string / number / boolean / json`，未知类型按字符串处理
- 资源项：检查器「资源」区按类型动态添加图片/模型/音频/其它，登记名称与 `assets/` 相对路径；增删改各一条历史，文本编辑合并，删除可撤销
- 资产预览：资源项「◎」打开预览；图片按路径显示（读不到可选本地文件），模型用 three.js 懒加载查看——可旋转/缩放/平移，带节点树、材质参数、贴图缩略图与三角面统计
- 模型通配清单：资源区按「网格 + 基础色 / 法线 / ORM」检查最低配，一键补齐；可勾选角色（骨骼/蒙皮/动画）与场景件（LOD/碰撞），已有资源按标签/路径自动识别槽位
- 端口：任意增删、改名、单条/多条容量、方向校验
- 连线：只能输出→输入；重复线、自连、单条输入口超限都会被拒绝并提示
- 删端口不删边：有连线时先弹出**重连向导**（改接 / 新建端口 / 保留孤儿 / 删除边），无连线直接删
- 多选：整组拖动、对齐（左/中/右、上/中/下）、等距分布、复制粘贴（含内部连线），工具条在画布顶部
- 撤销/重做：命令式历史（每条记录带 run/revert），`Cmd/Ctrl+Z`、`Shift+Cmd/Ctrl+Z`；同一属性 500ms 内的连续编辑合并为一条
- 左侧大纲：按 kind 分组、搜索高亮（标题/id/kind/属性名值）、按 kind 过滤、只看孤立/孤儿节点，`Enter` 跳转下一个
- 命令面板：`Cmd/Ctrl+K`，新建/按模板新建/跳转/保存/打开/适应视图/撤销重做/复制粘贴/清理孤儿/删除
- 模板：`kinds` 定义默认属性与端口，新建或应用模板只补缺省值，不覆盖已有数据；可把当前节点存为模板
- 子图：节点内嵌一张完整图；双击进入，面包屑逐级返回；父端口可映射到内部同向端口
- 只读预览：子图内可切换预览，隐藏拖动/连线/删除/新建/撤销等编辑入口，避免误改
- 表格投影：顶部「图 / 表格」切换；按 `kind` 分组、属性列排序/过滤、行内编辑（与画布同一条 `commit`）、多选批量改、列显隐；双击行回到画布并定位
- 影响面：选中单元后高亮上下游 N 层（1–5，默认 2），其余淡出；面板按层列出受影响清单，只读派生，不改数据
- 导出契约：工具栏「导出…」先 dry-run 再导出 Forgeworks `project.json`；未映射属性/孤儿边/未匹配边规则给提示，业务 id 重复、必填缺失、悬空引用为错误并阻止导出
- 反向导入：对话框或命令面板「导入 project.json…」，按附录 A 还原节点、属性与四类边（配方输入/产出、runs on、unlocks），导入前同样出 dry-run
- 自动布局：工具栏「自动布局」或 `⌘⇧L`，按依赖分层重排当前层（回边、孤儿边、孤立节点都有处理），整次布局一条历史可撤销
- 版本快照：工具栏「快照…」把整图存成本地副本（最多 20 份），可查看与当前的差异明细、一键回滚；回滚是一条历史，⌘Z 可撤销
- 多图容器：一个 project 管多张根图、共享 `kinds`；侧栏切换/重命名/删除，整份数据存 `nodeworks.project.v1`
- 目录项目：工具栏「存为目录 / 打开目录」把整份项目写成 `project.json` + `graphs/<图名>__<id>/graph.json` + `nodes/<标题>__<id>/node.json`，每次修改防抖回写；文件夹即数据源，可直接进 git（需 Chrome / Edge）。资源项可用「⇧」导入本地文件，存目录时落进该节点的 `resources/`，`node.json` 里用 `file` 记录
- 子图可视化：子图卡片内是可交互缩略图（滚轮缩放、拖动平移、点小方块进入并选中）；进入子图后左右出现「外层输入/输出」代理，直接拖线就把父端口映射到本层端点
- 映射外置：`src/mappings/forgeworks.mapping.json`，导出对话框可下载映射、载入自定义 `export.mapping.json`、恢复默认
- 跨子图直连：子图层把输出端口拖到「连接到其它子图…」，选另一子图内部的输入端口；自动建外层端口、写映射、连根层边，一条历史可撤销
- MCP：`mcp/server.ts` 提供 stdio MCP，AI 可读图、建模板、增删单元/连线、自动布局、导出与校验、文件级快照（见下）
- 持久化：编辑防抖写入 localStorage；工具栏「保存」下载整份 `nodeworks.project.json`（多张根图 + 共享 kinds + active），「打开」支持单图或 project 多图文件并做 zod 校验
- 示例图：钛矿 → 钛锭 → 钛板

## 数据模型

```jsonc
{
  "version": 1,
  "nodes": [
    {
      "id": "n_xxx",
      "kind": "item",
      "title": "钛锭",
      "props": { "value": { "value": 9, "type": "number", "unit": "cr" } },
      "ports": [
        { "id": "p_in", "dir": "in", "label": "矿石", "capacity": "many" },
        { "id": "p_out", "dir": "out", "label": "钛锭", "capacity": "many" }
      ],
      "pos": { "x": 430, "y": 180 },
      "resources": [
        { "id": "r_icon", "type": "image", "label": "图标", "path": "assets/icon_ti.png" }
      ]
    }
  ],
  "edges": [
    {
      "id": "e_xxx",
      "from": { "node": "n_ore", "port": "p_out" },
      "to": { "node": "n_ingot", "port": "p_in" },
      "label": "2 : 1",
      "props": { "ratio": { "value": 2, "type": "number" } }
    }
  ],
  "kinds": {}
}
```

约定：

- 端口 `id` 一旦生成就不再变，改名只动 `label`，所以重命名不会断线
- 关系自身的数据（配比、速率）放 `edges[].props`，不塞回节点
- `kinds` 是可选模板，不是类型约束；没有 `kind` 的节点一样合法
- 孤儿边保留在 `edges` 里并带 `orphan: true`，不会被静默删除
- 子图存在 `node.subgraph`（嵌套 `Graph`），端口映射存在 `node.subgraphMap`；历史与校验都以根图为准

## MCP（让 AI 编辑图）

```bash
pnpm build:mcp        # esbuild → mcp/server.mjs
node mcp/server.mjs --file .nodeworks/project.json
```

MCP 客户端配置（Claude Code / 任意 stdio 客户端）：

```json
{
  "mcpServers": {
    "nodeworks": {
      "command": "node",
      "args": ["/absolute/path/to/Nodeworks/mcp/server.mjs", "--file", "/absolute/path/to/project.json"]
    }
  }
}
```

工具（19 个）：`project_info`、`get_graph`、`create_graph`、`set_active_graph`、`define_kind`、`find_nodes`、`add_node`、`update_node`、`remove_nodes`、`add_edge`、`remove_edges`、`auto_layout`、`export_project`、`validate_project`、`list_snapshots`、`create_snapshot`、`restore_snapshot`、`delete_snapshot`、`undo`。

自定义映射：启动加 `--mapping <export.mapping.json>`（或 env `NODEWORKS_MAPPING`），`export_project` 也可单次传 `mapping`。快照为文件级，存 `<project>.snapshots.json`（最多 20 份），与编辑器 localStorage 快照彼此独立；`restore_snapshot` 整体替换项目，`undo` 可退回。

注意：MCP 直接写文件；应用不会自动监听外部修改，AI 改完后在应用里重新「打开」同一文件即可。文件读写的是 project 文档（`{version:1, active, graphs}`），与应用 localStorage 同构。

## 下一步

- 只读分享页、协作、快照导出为文件、端口类型强约束、嵌套子图互连、目录项目资源落盘（P15b）

## 开发约定

- 小步提交：每个小功能完成后，`pnpm test` 与 `pnpm build` 通过即提交一次；提交信息用 `feat:` / `fix:` / `docs:` 前缀。
- 文档随代码走：行为变化同批更新 `docs/design.md` 与 README，不把文档留到“最后统一补”。

## 测试

```bash
pnpm test     # 164 项：模型纯函数、历史合并、自动布局、快照差异、剪贴板、查询、路径、表格、影响面、跨子图、导入导出映射、项目多图、目录项目、资源落盘、store 集成
pnpm typecheck:mcp   # MCP 源码类型检查
pnpm build    # tsc --noEmit && vite build
```
