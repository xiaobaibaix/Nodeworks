# Nodeworks MCP

stdio MCP server，让 AI 直接读写 Nodeworks 的 project.json。

## 构建与运行

```bash
pnpm build:mcp                                  # 产出 mcp/server.mjs（esbuild 打包，已 gitignore）
node mcp/server.mjs --file path/to/project.json # 单文件项目，也可用 NODEWORKS_PROJECT
node mcp/server.mjs --dir path/to/project       # 目录项目（project.json + graphs/ + nodes/）
```

默认文件：`.nodeworks/project.json`（相对启动目录）。`--dir` 指向的目录不存在或为空时会先建一张空「主图」，第一次写入落盘成完整目录项目。

## 客户端配置

```json
{
  "mcpServers": {
    "nodeworks": {
      "command": "node",
      "args": ["/absolute/path/to/Nodeworks/mcp/server.mjs", "--dir", "/absolute/path/to/project"]
    }
  }
}
```

## 工具

| 工具 | 作用 |
| --- | --- |
| `project_info` | 文件、当前图、各图规模 |
| `get_graph` | 读完整图 JSON |
| `create_graph` / `set_active_graph` | 新建/切换根图 |
| `define_kind` | 定义 kind 模板（默认属性与端口） |
| `find_nodes` / `add_node` / `update_node` / `remove_nodes` | 查/增/改/删单元 |
| `add_edge` / `remove_edges` | 连线（可带配比 amount） |
| `add_resource` | 给单元挂图片/模型/音频，文件复制进节点 `resources/`（仅目录项目） |
| `auto_layout` | 分层布局 |
| `export_project` | 按默认映射 dry-run + 可选写文件 |
| `validate_project` | schema 校验 |
| `undo` | 撤销本会话最近一次写操作（50 步） |

## 文件格式

与应用 localStorage 的 project 文档同构：

```jsonc
{
  "version": 1,
  "active": "pg_xxx",
  "graphs": [{ "id": "pg_xxx", "name": "主图", "graph": { "version": 1, "nodes": [], "edges": [], "kinds": {} } }]
}
```

应用工具栏「打开」可直接载入该文件；应用不会监听外部修改，AI 改完后重新打开即可。
