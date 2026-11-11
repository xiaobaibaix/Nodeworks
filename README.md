# Nodeworks

以「单元节点」为基元的内容编辑器（设计文档见 [docs/design.md](docs/design.md)）：每个节点自带动态属性、可变输入/输出端口，
节点之间用连线组成图；图是唯一真源，表格/导出都只是投影。

## 运行

```bash
pnpm install
pnpm dev
```

然后打开 Vite 打印的地址（默认 http://127.0.0.1:5173）。

## 已实现（P0 + P1 + P2 + P3 + P4）

- 画布：缩放、平移、框选、小地图、适应视图（React Flow）
- 单元节点：标题、`kind` 标签、动态属性、动态端口
- 属性：任意增删，类型 `string / number / boolean / json`，未知类型按字符串处理
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
- 持久化：编辑防抖写入 localStorage；工具栏「保存」下载 `project.graph.json`，「打开」载入并做 zod 校验
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
      "pos": { "x": 430, "y": 180 }
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

## 下一步

- P0–P4 主路径已收口；之后（未排期）：自动布局、版本快照、只读分享、协作
- 把 `FORGEWORKS_MAPPING` 抽成可编辑的 `export.mapping.json`（当前为 `src/model/mapping.ts` 里的常量）

## 开发约定

- 小步提交：每个小功能完成后，`pnpm test` 与 `pnpm build` 通过即提交一次；提交信息用 `feat:` / `fix:` / `docs:` 前缀。
- 文档随代码走：行为变化同批更新 `docs/design.md` 与 README，不把文档留到“最后统一补”。

## 测试

```bash
pnpm test     # 99 项：模型纯函数、历史合并、布局、剪贴板、查询、路径、表格、影响面、导入导出映射、store 集成
pnpm build    # tsc --noEmit && vite build
```
