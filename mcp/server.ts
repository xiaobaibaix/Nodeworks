/**
 * Nodeworks MCP server（stdio）。
 *
 * 直接读写 project.json（与编辑器 localStorage 同构），让 AI 能看见并编辑图。
 * 构建：pnpm build:mcp  →  mcp/server.mjs
 * 运行：node mcp/server.mjs --file <project.json>
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { layeredLayout, estimateSize } from '../src/model/autolayout';
import { DEFAULT_MAPPING, exportProject, validateMapping, type DryRunReport, type ExportMapping } from '../src/model/mapping';
import {
  addEdgeOp, addNodeOp, createEdge, createNode, createNodeFromKind, createPort,
  findNode, moveNodesOp, removeEdgeOp, removeNodesOp, renameNodeOp, setKindOp,
  setNodePosOp, setPropOp, validateConnection,
} from '../src/model/ops';
import {
  activeGraph, addGraph, parseProjectDoc, projectFromGraph,
  switchGraph, type ProjectDoc,
} from '../src/model/project';
import { GraphSchema } from '../src/model/schema';
import { readProject, writeProject } from '../src/model/folder';
import { NodeFS } from './node-fs';
import type { Endpoint, Graph, PropBag, PropMeta, UnitNode } from '../src/model/types';

type Json = Record<string, unknown>;

const argv = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const FILE = resolve(arg('--file') ?? process.env.NODEWORKS_PROJECT ?? '.nodeworks/project.json');
const MAPPING_FILE = arg('--mapping') ?? process.env.NODEWORKS_MAPPING;
/** --file 指向目录时走目录项目（project.json + graphs/ + nodes/）。 */
const FOLDER_MODE = existsSync(FILE) && statSync(FILE).isDirectory();
const SNAP_FILE = FOLDER_MODE ? resolve(FILE, 'snapshots.json') : `${FILE}.snapshots.json`;
const SNAP_LIMIT = 20;

/** 解析导出映射：工具参数 > --mapping/env > 内置默认。 */
function resolveMapping(ref?: string): ExportMapping {
  const raw = ref ?? MAPPING_FILE;
  if (!raw) return DEFAULT_MAPPING;
  const target = isAbsolute(raw) ? raw : resolve(dirname(FILE), raw);
  if (!existsSync(target)) throw new Error(`映射文件不存在：${target}`);
  try {
    return validateMapping(JSON.parse(readFileSync(target, 'utf8')));
  } catch (error) {
    throw new Error(`映射文件无效：${target}（${(error as Error).message}）`);
  }
}

interface SnapEntry {
  id: string;
  at: number;
  label: string;
  project: ProjectDoc;
}

function loadSnaps(): SnapEntry[] {
  if (!existsSync(SNAP_FILE)) return [];
  try {
    const raw = JSON.parse(readFileSync(SNAP_FILE, 'utf8')) as { snapshots?: unknown };
    if (!Array.isArray(raw.snapshots)) return [];
    return raw.snapshots.filter((entry): entry is SnapEntry => {
      const snap = entry as SnapEntry;
      return Boolean(snap && typeof snap.id === 'string' && typeof snap.label === 'string'
        && typeof snap.at === 'number' && parseProjectDoc(snap.project));
    });
  } catch {
    return [];
  }
}

function saveSnaps(list: SnapEntry[]): void {
  mkdirSync(dirname(SNAP_FILE), { recursive: true });
  writeFileSync(SNAP_FILE, `${JSON.stringify({ version: 1, snapshots: list }, null, 2)}\n`, 'utf8');
}

let doc: ProjectDoc | null = null;
let onDisk = false;
const history: Array<{ doc: ProjectDoc; label: string }> = [];
if (FOLDER_MODE) {
  doc = await readProject(new NodeFS(FILE));
  onDisk = true;
}

function loadDoc(): ProjectDoc {
  if (doc) return doc;
  if (!existsSync(FILE)) {
    doc = projectFromGraph(emptyGraphOf(), '主图');
    onDisk = false;
    return doc;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(FILE, 'utf8'));
  } catch (error) {
    throw new Error(`项目文件不是合法 JSON：${FILE}（${(error as Error).message}）`);
  }
  const parsed = parseProjectDoc(raw);
  if (!parsed) {
    throw new Error(`项目文件校验失败：${FILE}。需要 {version:1, active, graphs:[{id,name,graph}]}，且每张图都合法。`);
  }
  doc = parsed;
  onDisk = true;
  return doc;
}

function emptyGraphOf(): Graph {
  return { version: 1, nodes: [], edges: [], kinds: {} };
}

async function persist(next: ProjectDoc): Promise<void> {
  if (FOLDER_MODE) {
    await writeProject(new NodeFS(FILE), next);
  } else {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
  doc = next;
  onDisk = true;
}

async function mutate(label: string, fn: (d: ProjectDoc) => void): Promise<void> {
  const before = structuredClone(loadDoc());
  history.push({ doc: before, label });
  if (history.length > 50) history.shift();
  const next = structuredClone(loadDoc());
  fn(next);
  await persist(next);
}

function graphCard(d: ProjectDoc, ref?: string) {
  if (ref) {
    const card = d.graphs.find((g) => g.id === ref || g.name === ref);
    if (!card) throw new Error(`找不到图「${ref}」；可用：${d.graphs.map((g) => `${g.id}(${g.name})`).join('、')}`);
    return card;
  }
  return d.graphs.find((g) => g.id === d.active) ?? d.graphs[0];
}

function graphOf(d: ProjectDoc, ref?: string): Graph {
  return graphCard(d, ref).graph;
}

function replaceGraph(d: ProjectDoc, ref: string | undefined, g: Graph): void {
  graphCard(d, ref).graph = g;
}

function toMeta(value: unknown): PropMeta {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in (value as Json)) {
    return value as PropMeta;
  }
  const type =
    typeof value === 'number' ? 'number'
      : typeof value === 'boolean' ? 'boolean'
        : Array.isArray(value) || (value && typeof value === 'object') ? 'json'
          : 'string';
  return { value, type };
}

function toProps(input: unknown): PropBag {
  const bag: PropBag = {};
  if (!input || typeof input !== 'object') return bag;
  for (const [key, value] of Object.entries(input as Json)) bag[key] = toMeta(value);
  return bag;
}

interface PortSpec {
  id?: string;
  dir: 'in' | 'out';
  label?: string;
  capacity?: 'one' | 'many';
}

function buildPorts(specs: unknown): UnitNode['ports'] {
  if (!Array.isArray(specs)) return [];
  return specs.map((raw) => {
    const spec = raw as PortSpec;
    if (spec.dir !== 'in' && spec.dir !== 'out') throw new Error('端口 dir 只能是 in/out');
    const port = createPort(spec.dir, spec.label, spec.capacity ?? (spec.dir === 'in' ? 'one' : 'many'));
    if (spec.id) port.id = spec.id;
    return port;
  });
}

function resolveEndpoint(raw: unknown): Endpoint {
  const e = (raw ?? {}) as Json;
  const node = typeof e.node === 'string' ? e.node : typeof e.nodeId === 'string' ? e.nodeId : '';
  const port = typeof e.port === 'string' ? e.port : typeof e.portId === 'string' ? e.portId : '';
  if (!node || !port) throw new Error('端点需要 { node, port }');
  return { node, port };
}

function myNode(g: Graph, id: string): UnitNode {
  const node = findNode(g, id);
  if (!node) throw new Error(`找不到单元「${id}」`);
  return node;
}

function summary(node: UnitNode): Json {
  return {
    id: node.id,
    title: node.title,
    kind: node.kind ?? null,
    pos: node.pos,
    ports: node.ports.map((p) => `${p.id}:${p.dir}:${p.label}`),
    props: Object.fromEntries(Object.entries(node.props).map(([k, v]) => [k, v.value])),
    subgraph: node.subgraph ? `${node.subgraph.nodes.length} 单元` : undefined,
  };
}

function reportOf(report: DryRunReport, limit = 20): Json {
  return {
    errors: report.errors,
    warnings: report.warnings,
    counts: report.counts,
    issues: report.issues.slice(0, limit).map((i) => `${i.level}:${i.code}: ${i.message}`),
    truncated: report.issues.length > limit,
  };
}

const S = {
  str: (description: string) => ({ type: 'string', description }),
  num: (description: string) => ({ type: 'number', description }),
  bool: (description: string) => ({ type: 'boolean', description }),
  obj: (description: string, properties: Json = {}, required: string[] = []) => ({
    type: 'object',
    description,
    properties,
    required,
    additionalProperties: true,
  }),
  arr: (description: string, items: Json) => ({ type: 'array', description, items }),
};

const portSchema = S.obj('端口', {
  id: S.str('稳定 id，可省略'),
  dir: { type: 'string', enum: ['in', 'out'] },
  label: S.str('显示名'),
  capacity: { type: 'string', enum: ['one', 'many'] },
}, ['dir']);

const endpointSchema = S.obj('端点', {
  node: S.str('单元 id'),
  port: S.str('端口 id'),
}, ['node', 'port']);

const common = {
  graph: S.str('目标图 id 或名称；省略则用当前图'),
};

interface Tool {
  name: string;
  description: string;
  inputSchema: Json;
  run: (args: Json) => unknown | Promise<unknown>;
}

const tools: Tool[] = [
  {
    name: 'project_info',
    description: '项目文件路径、是否存在、当前图与各图规模。',
    inputSchema: S.obj('无参数'),
    run: async () => {
      const d = loadDoc();
      const active = activeGraph(d);
      return {
        file: FILE,
        exists: onDisk,
        active: { id: active.id, name: active.name },
        graphs: d.graphs.map((g) => ({
          id: g.id,
          name: g.name,
          nodes: g.graph.nodes.length,
          edges: g.graph.edges.length,
          kinds: Object.keys(g.graph.kinds),
        })),
        history: history.length,
      };
    },
  },
  {
    name: 'get_graph',
    description: '读取一张图的完整 JSON（节点、连线、kinds）。',
    inputSchema: S.obj('参数', { ...common }),
    run: async ({ graph }) => {
      const d = loadDoc();
      const card = graphCard(d, typeof graph === 'string' ? graph : undefined);
      return { id: card.id, name: card.name, graph: card.graph };
    },
  },
  {
    name: 'create_graph',
    description: '新建一张图（继承共享 kinds）并设为当前图。',
    inputSchema: S.obj('参数', { name: S.str('图名，默认“图 N”') }),
    run: async ({ name }) => {
      let id = '';
      await mutate('新建图', (d) => {
        const res = addGraph(d, typeof name === 'string' ? name : undefined);
        id = res.id;
        Object.assign(d, res.project);
      });
      return { id, active: loadDoc().active };
    },
  },
  {
    name: 'set_active_graph',
    description: '切换当前图（id 或名称）。',
    inputSchema: S.obj('参数', { graph: S.str('图 id 或名称') }, ['graph']),
    run: async ({ graph }) => {
      await mutate('切换图', (d) => {
        const next = switchGraph(d, String(graph));
        if (!next) throw new Error(`找不到图「${graph}」`);
        Object.assign(d, next);
      });
      const d = loadDoc();
      return { active: d.active, name: graphCard(d).name };
    },
  },
  {
    name: 'find_nodes',
    description: '按标题/id/kind/属性值搜索单元，返回摘要。',
    inputSchema: S.obj('参数', {
      ...common,
      query: S.str('搜索词，可省略'),
      kind: S.str('只看某个 kind'),
      limit: S.num('默认 50'),
    }),
    run: async ({ graph, query, kind, limit }) => {
      const g = graphOf(loadDoc(), typeof graph === 'string' ? graph : undefined);
      const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
      const max = typeof limit === 'number' ? Math.max(1, Math.min(200, limit)) : 50;
      const hit = (n: UnitNode) => {
        if (typeof kind === 'string' && kind && n.kind !== kind) return false;
        if (!q) return true;
        const hay = [n.title, n.id, n.kind ?? '', ...Object.entries(n.props).flatMap(([k, v]) => [k, String(v.value)])]
          .join(' ').toLowerCase();
        return hay.includes(q);
      };
      const nodes = g.nodes.filter(hit);
      return { total: nodes.length, shown: Math.min(max, nodes.length), nodes: nodes.slice(0, max).map(summary) };
    },
  },
  {
    name: 'define_kind',
    description: '定义/更新一种单元模板（kind）：默认属性与默认端口，供 add_node 使用。',
    inputSchema: S.obj('参数', {
      ...common,
      name: S.str('kind 键名，如 item / recipe / machine'),
      title: S.str('显示名，默认同键名'),
      color: S.str('颜色，如 #d9a441'),
      defaults: S.obj('默认属性（值或 {value,type,unit}）'),
      ports: S.arr('默认端口（无 id）', S.obj('端口', {
        dir: { type: 'string', enum: ['in', 'out'] },
        label: S.str('显示名'),
        capacity: { type: 'string', enum: ['one', 'many'] },
      }, ['dir'])),
    }, ['name']),
    run: async ({ graph, name, title, color, defaults, ports }) => {
      const ref = typeof graph === 'string' ? graph : undefined;
      const key = String(name ?? '').trim();
      if (!key) throw new Error('name 不能为空');
      let count = 0;
      await mutate('定义模板', (d) => {
        const g = graphOf(d, ref);
        count = g.nodes.filter((n) => n.kind === key).length;
        const def = {
          name: typeof title === 'string' && title ? title : key,
          ...(typeof color === 'string' && color ? { color } : {}),
          ...(defaults ? { defaults: toProps(defaults) } : {}),
          ...(Array.isArray(ports)
            ? { ports: buildPorts(ports).map(({ id: _id, ...rest }) => rest) }
            : {}),
        };
        replaceGraph(d, ref, { ...g, kinds: { ...g.kinds, [key]: def } });
      });
      return { kind: key, affectedNodes: count };
    },
  },
  {
    name: 'add_node',
    description: '新建单元。kind 命中模板时自动带默认属性与端口；也可显式给 ports。',
    inputSchema: S.obj('参数', {
      ...common,
      title: S.str('标题，默认“新单元”'),
      kind: S.str('kind 模板名'),
      id: S.str('自定义 id（可省略）'),
      x: S.num('x 坐标'),
      y: S.num('y 坐标'),
      props: S.obj('属性（值或 {value,type,unit}）'),
      ports: S.arr('端口列表（覆盖模板端口）', portSchema),
    }),
    run: async ({ graph, title, kind, id, x, y, props, ports }) => {
      const ref = typeof graph === 'string' ? graph : undefined;
      const d = loadDoc();
      const g = graphOf(d, ref);
      if (typeof kind === 'string' && kind && !g.kinds[kind]) {
        throw new Error(`图里没有 kind「${kind}」；先用 define_kind 定义，已有：${Object.keys(g.kinds).join('、') || '（无）'}`);
      }
      const pos = { x: typeof x === 'number' ? x : 160, y: typeof y === 'number' ? y : 160 };
      const node = typeof kind === 'string' && kind
        ? createNodeFromKind(kind, g.kinds[kind], pos)
        : createNode(typeof title === 'string' ? title : undefined, pos);
      if (typeof title === 'string' && title) node.title = title;
      if (typeof id === 'string' && id) {
        if (findNode(g, id)) throw new Error(`单元 id 已存在：${id}`);
        node.id = id;
      }
      node.props = { ...node.props, ...toProps(props) };
      if (Array.isArray(ports)) node.ports = buildPorts(ports);
      await mutate('新增单元', (dd) => replaceGraph(dd, ref, addNodeOp(graphOf(dd, ref), node)));
      return summary(node);
    },
  },
  {
    name: 'update_node',
    description: '改标题、kind、坐标、属性（合并）。',
    inputSchema: S.obj('参数', {
      ...common,
      id: S.str('单元 id'),
      title: S.str('新标题'),
      kind: S.str('新 kind'),
      x: S.num('x 坐标'),
      y: S.num('y 坐标'),
      props: S.obj('要合并的属性'),
    }, ['id']),
    run: async ({ graph, id, title, kind, x, y, props }) => {
      const ref = typeof graph === 'string' ? graph : undefined;
      await mutate('编辑单元', (d) => {
        let g = graphOf(d, ref);
        const node = myNode(g, String(id));
        if (typeof title === 'string') g = renameNodeOp(g, node.id, title);
        if (typeof kind === 'string') g = setKindOp(g, node.id, kind);
        if (typeof x === 'number' && typeof y === 'number') g = setNodePosOp(g, node.id, { x, y });
        for (const [key, value] of Object.entries(toProps(props))) {
          g = setPropOp(g, node.id, key, value);
        }
        replaceGraph(d, ref, g);
      });
      return summary(myNode(graphOf(loadDoc(), ref), String(id)));
    },
  },
  {
    name: 'remove_nodes',
    description: '删除单元（连带其连线）。',
    inputSchema: S.obj('参数', { ...common, ids: S.arr('单元 id', S.str('id')) }, ['ids']),
    run: async ({ graph, ids }) => {
      const ref = typeof graph === 'string' ? graph : undefined;
      if (!Array.isArray(ids) || !ids.length) throw new Error('ids 不能为空');
      await mutate('删除单元', (d) => replaceGraph(d, ref, removeNodesOp(graphOf(d, ref), ids.map(String))));
      return { removed: ids.length, nodes: graphOf(loadDoc(), ref).nodes.length };
    },
  },
  {
    name: 'add_edge',
    description: '连接两个端口（输出 → 输入）；可带配比 amount。',
    inputSchema: S.obj('参数', {
      ...common,
      from: endpointSchema,
      to: endpointSchema,
      label: S.str('连线标签'),
      amount: S.num('配比/速率，写入 props.amount'),
    }, ['from', 'to']),
    run: async ({ graph, from, to, label, amount }) => {
      const ref = typeof graph === 'string' ? graph : undefined;
      const fromEp = resolveEndpoint(from);
      const toEp = resolveEndpoint(to);
      const g0 = graphOf(loadDoc(), ref);
      const problem = validateConnection(g0, fromEp, toEp);
      if (problem) throw new Error(problem);
      const edge = createEdge(fromEp, toEp);
      if (typeof label === 'string' && label) edge.label = label;
      if (typeof amount === 'number') edge.props = { amount: { type: 'number', value: amount } };
      await mutate('新增连线', (d) => replaceGraph(d, ref, addEdgeOp(graphOf(d, ref), edge)));
      return { id: edge.id, from: edge.from, to: edge.to, label: edge.label ?? null };
    },
  },
  {
    name: 'remove_edges',
    description: '删除连线。',
    inputSchema: S.obj('参数', { ...common, ids: S.arr('连线 id', S.str('id')) }, ['ids']),
    run: async ({ graph, ids }) => {
      const ref = typeof graph === 'string' ? graph : undefined;
      if (!Array.isArray(ids) || !ids.length) throw new Error('ids 不能为空');
      await mutate('删除连线', (d) => {
        let g = graphOf(d, ref);
        for (const id of ids) g = removeEdgeOp(g, String(id));
        replaceGraph(d, ref, g);
      });
      return { removed: ids.length };
    },
  },
  {
    name: 'auto_layout',
    description: '分层自动布局并写回坐标。',
    inputSchema: S.obj('参数', { ...common }),
    run: async ({ graph }) => {
      const ref = typeof graph === 'string' ? graph : undefined;
      let moved = 0;
      await mutate('自动布局', (d) => {
        const g = graphOf(d, ref);
        const sizes: Record<string, { width: number; height: number }> = {};
        for (const n of g.nodes) sizes[n.id] = estimateSize(n);
        const layout = layeredLayout(g, sizes);
        moved = Object.keys(layout.positions).length;
        replaceGraph(d, ref, moveNodesOp(g, layout.positions));
      });
      return { moved, width: graphCard(loadDoc(), ref).graph.nodes.length };
    },
  },
  {
    name: 'export_project',
    description: '按映射导出为 Forgeworks project.json 并 dry-run；可选自定义映射文件与写出文件。',
    inputSchema: S.obj('参数', {
      ...common,
      mapping: S.str('映射文件路径（相对项目文件）；省略用 --mapping 或内置默认映射'),
      out: S.str('输出路径；省略则只返回报告'),
    }),
    run: async ({ graph, out, mapping }) => {
      const d = loadDoc();
      const g = graphOf(d, typeof graph === 'string' ? graph : undefined);
      const result = exportProject(g, resolveMapping(typeof mapping === 'string' ? mapping : undefined));
      if (typeof out === 'string' && out) {
        const target = isAbsolute(out) ? out : resolve(dirname(FILE), out);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, `${JSON.stringify(result.project, null, 2)}\n`, 'utf8');
      }
      return { ...reportOf(result.report), wrote: typeof out === 'string' ? out : null };
    },
  },
  {
    name: 'list_snapshots',
    description: '列出文件级快照（与项目文件同目录的 .snapshots.json，独立于编辑器 localStorage 快照）。',
    inputSchema: S.obj('无参数'),
    run: async () => {
      const list = loadSnaps();
      return {
        file: SNAP_FILE,
        snapshots: list.map((s) => ({
          id: s.id,
          label: s.label,
          at: new Date(s.at).toISOString(),
          graphs: s.project.graphs.length,
          nodes: s.project.graphs.reduce((n, g) => n + g.graph.nodes.length, 0),
        })),
      };
    },
  },
  {
    name: 'create_snapshot',
    description: '把当前整个项目（所有图）存为快照，用于危险批量编辑前回滚。',
    inputSchema: S.obj('参数', { label: S.str('快照名；省略用时间') }),
    run: async ({ label }) => {
      const list = loadSnaps();
      const at = Date.now();
      const time = new Date(at).toTimeString().slice(0, 5);
      const entry: SnapEntry = {
        id: `snap_${at.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        at,
        label: typeof label === 'string' && label.trim() ? label.trim() : `快照 ${time}`,
        project: structuredClone(loadDoc()),
      };
      list.unshift(entry);
      saveSnaps(list.slice(0, SNAP_LIMIT));
      return { id: entry.id, label: entry.label, total: Math.min(list.length, SNAP_LIMIT) };
    },
  },
  {
    name: 'restore_snapshot',
    description: '回滚到某个文件级快照（覆盖当前项目文件；可用 undo 退回回滚前）。',
    inputSchema: S.obj('参数', { id: S.str('快照 id') }, ['id']),
    run: async ({ id }) => {
      const list = loadSnaps();
      const snap = list.find((s) => s.id === id);
      if (!snap) throw new Error(`找不到快照「${String(id)}」`);
      await mutate('restore snapshot', (d) => {
        const next = structuredClone(snap.project);
        d.version = next.version;
        d.active = next.active;
        d.graphs = next.graphs;
      });
      return { restored: snap.label, graphs: snap.project.graphs.map((g) => `${g.name}: ${g.graph.nodes.length} 单元`) };
    },
  },
  {
    name: 'delete_snapshot',
    description: '删除一个文件级快照。',
    inputSchema: S.obj('参数', { id: S.str('快照 id') }, ['id']),
    run: async ({ id }) => {
      const list = loadSnaps();
      const next = list.filter((s) => s.id !== id);
      saveSnaps(next);
      return { deleted: list.length - next.length, total: next.length };
    },
  },
  {
    name: 'validate_project',
    description: '校验项目文件里每张图是否符合 schema。',
    inputSchema: S.obj('无参数'),
    run: async () => {
      const d = loadDoc();
      return {
        ok: d.graphs.every((g) => GraphSchema.safeParse(g.graph).success),
        graphs: d.graphs.map((g) => {
          const res = GraphSchema.safeParse(g.graph);
          return {
            id: g.id,
            name: g.name,
            ok: res.success,
            errors: res.success ? [] : res.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`),
          };
        }),
      };
    },
  },
  {
    name: 'undo',
    description: '撤销本 MCP 会话内最近一次写操作（最多 50 步）。',
    inputSchema: S.obj('无参数'),
    run: async () => {
      const entry = history.pop();
      if (!entry) return { undone: false, message: '没有可撤销的操作' };
      await persist(entry.doc);
      return { undone: true, label: entry.label, remaining: history.length };
    },
  },
];

type RpcId = string | number | null;

function send(payload: Json): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function reply(id: RpcId, result: unknown): void {
  send({ jsonrpc: '2.0', id, result });
}

function fail(id: RpcId, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg: Json): Promise<void> {
  const id = (msg.id ?? null) as RpcId;
  const method = msg.method;
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'nodeworks', version: '0.2.0' },
      instructions:
        `Nodeworks 项目 MCP，文件：${FILE}。修改立即写盘；用 get_graph 查看现状，用 undo 撤回最近一次写操作。`,
    });
    return;
  }
  if (method === 'notifications/initialized' || method === 'initialized') return;
  if (method === 'ping') {
    reply(id, {});
    return;
  }
  if (method === 'tools/list') {
    reply(id, {
      tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
    return;
  }
  if (method === 'tools/call') {
    const params = (msg.params ?? {}) as Json;
    const name = String(params.name ?? '');
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      reply(id, { content: [{ type: 'text', text: `未知工具：${name}` }], isError: true });
      return;
    }
    try {
      const args = (params.arguments ?? {}) as Json;
      const result = await tool.run(args);
      reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
    } catch (error) {
      reply(id, {
        content: [{ type: 'text', text: `错误：${(error as Error).message}` }],
        isError: true,
      });
    }
    return;
  }
  if (id !== null) fail(id, -32601, `未知方法：${String(method)}`);
}

const rl = createInterface({ input: process.stdin, terminal: false });
let queue: Promise<void> = Promise.resolve();
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg: Json;
  try {
    msg = JSON.parse(trimmed) as Json;
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON 解析失败' } });
    return;
  }
  queue = queue.then(() => handle(msg)).catch((error: unknown) => {
    const id = (msg.id ?? null) as RpcId;
    fail(id, -32603, (error as Error).message);
  });
});
