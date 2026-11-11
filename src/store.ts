import { create } from 'zustand';
import { copySelection, pasteClip, type ClipPayload } from './model/clipboard';
import { pushEntry, type Entry, type EntryInput } from './model/history';
import { graphAtPath, normalizePath, updateAtPath } from './model/path';
import { EMPTY_FILTER, type GraphFilter } from './model/query';
import { emptySubgraph } from './model/schema';
import {
  addEdgeOp, addNodeOp, addPortOp, createEdge, createNode, createNodeFromKind, createPort,
  findNode, isPortEndpoint, moveNodesOp, orphanEdges, removeEdgeOp, removeNodeOp, removeNodesOp,
  removePortEdgesOp, removePortOp, removePropOp, renameNodeOp, replaceNodeOp,
  replacePortInEdgesOp, setEdgeLabelOp, setKindOp, setNodePosOp, setPortOp,
  setPropOp, setSubgraphMapOp, validateConnection, withKindDefaults,
} from './model/ops';
import { sampleGraph } from './model/sample';
import { loadCached, saveCached } from './persistence';
import type { Endpoint, Graph, KindDef, PropMeta, UnitPort } from './model/types';

export type PortDeleteTarget =
  | { kind: 'rewire'; portId: string }
  | { kind: 'new' }
  | { kind: 'drop' }
  | { kind: 'orphan' };

type Pos = { x: number; y: number };

interface Store {
  graph: Graph;
  past: Entry[];
  future: Entry[];
  selectedNodes: string[];
  selectedEdge: string | null;
  toast: string | null;
  booted: boolean;
  filter: GraphFilter;
  clipboard: ClipPayload | null;
  pasteCount: number;
  /** 端口删除前已确认有关联边，等待重连向导处理 */
  pendingPort: { nodeId: string; portId: string } | null;
  paletteOpen: boolean;
  /** 从根到当前层的节点 id 链；空数组表示根图 */
  path: string[];
  /** 子图内只读预览 */
  preview: boolean;
  boot(): void;
  toastOf(msg: string | null): void;
  select(nodes: string[], edge: string | null): void;
  setFilter(patch: Partial<GraphFilter>): void;
  togglePalette(open?: boolean): void;
  commit(entry: EntryInput): void;
  undo(): void;
  redo(): void;
  addNode(pos?: Pos, kind?: string): void;
  removeNode(id: string): void;
  removeNodes(ids: string[]): void;
  renameNode(id: string, title: string): void;
  setKind(id: string, kind: string): void;
  silentMove(id: string, pos: Pos): void;
  silentMoveMany(moves: Record<string, Pos>): void;
  commitMove(id: string, from: Pos, to: Pos): void;
  commitMoveMany(from: Record<string, Pos>, to: Record<string, Pos>): void;
  moveNodes(moves: Record<string, Pos>, label: string): void;
  addProp(nodeId: string, name: string, type: string, value: unknown): void;
  setProp(nodeId: string, name: string, value: unknown): void;
  removeProp(nodeId: string, name: string): void;
  addPort(nodeId: string, dir: 'in' | 'out'): void;
  setPort(nodeId: string, portId: string, patch: Partial<UnitPort>): void;
  requestRemovePort(nodeId: string, portId: string): void;
  confirmRemovePort(target: PortDeleteTarget): void;
  cancelRemovePort(): void;
  connect(from: Endpoint, to: Endpoint): void;
  removeEdge(id: string): void;
  setEdgeLabel(id: string, label: string): void;
  clearOrphans(): void;
  applyKindTemplate(nodeId: string): void;
  saveAsKind(nodeId: string, name: string): void;
  copy(): void;
  paste(): void;
  load(g: Graph): void;
  saveToCache(): void;
  enterSubgraph(id: string): void;
  goToPath(depth: number): void;
  setPreview(on: boolean): void;
  addSubgraphNode(pos?: Pos): void;
  setSubgraphMap(nodeId: string, portId: string, endpoint: Endpoint | null): void;
}

/** 当前层图（根 / 子图）；组件统一通过它读，写操作由 commit 自动映射回根。 */
export function graphOf(state: { graph: Graph; path: string[] }): Graph {
  return graphAtPath(state.graph, state.path) ?? state.graph;
}

function randomPos(): Pos {
  return { x: 160 + Math.random() * 240, y: 140 + Math.random() * 160 };
}

export const useGraph = create<Store>((set, get) => ({
  graph: { version: 1, nodes: [], edges: [], kinds: {} },
  past: [],
  future: [],
  selectedNodes: [],
  selectedEdge: null,
  toast: null,
  booted: false,
  filter: EMPTY_FILTER,
  clipboard: null,
  pasteCount: 0,
  pendingPort: null,
  paletteOpen: false,
  path: [],
  preview: false,

  boot: () => {
    if (get().booted) return;
    const cached = loadCached();
    set({ graph: cached ?? sampleGraph(), booted: true });
  },

  toastOf: (msg) => set({ toast: msg }),

  select: (nodes, edge) => {
    const current = get();
    if (
      current.selectedEdge === edge &&
      current.selectedNodes.length === nodes.length &&
      current.selectedNodes.every((id, i) => id === nodes[i])
    ) {
      return;
    }
    set({ selectedNodes: nodes, selectedEdge: edge });
  },

  setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),

  togglePalette: (open) =>
    set({ paletteOpen: open ?? !get().paletteOpen }),

  commit: (input) => {
    const path = get().path;
    // 历史里记的是根图操作；当前层的 run/revert 在提交时抬升到根。
    const lift =
      (fn: (g: Graph) => Graph) =>
      (root: Graph): Graph =>
        updateAtPath(root, path, fn);
    const entry: Entry = {
      ...input,
      run: lift(input.run),
      revert: lift(input.revert),
      at: Date.now(),
    };
    set({
      graph: entry.run(get().graph),
      past: pushEntry(get().past, entry),
      future: [],
    });
  },

  undo: () => {
    const past = get().past;
    if (!past.length) return;
    const entry = past[past.length - 1];
    const graph = entry.revert(get().graph);
    const prev = get().path;
    const path = normalizePath(graph, prev);
    set({
      graph,
      path,
      past: past.slice(0, -1),
      future: [entry, ...get().future].slice(0, 100),
      ...(path.length !== prev.length
        ? { selectedNodes: [], selectedEdge: null, pendingPort: null }
        : {}),
    });
  },

  redo: () => {
    const future = get().future;
    if (!future.length) return;
    const entry = future[0];
    const graph = entry.run(get().graph);
    const prev = get().path;
    const path = normalizePath(graph, prev);
    set({
      graph,
      path,
      past: [...get().past, entry].slice(-100),
      future: future.slice(1),
      ...(path.length !== prev.length
        ? { selectedNodes: [], selectedEdge: null, pendingPort: null }
        : {}),
    });
  },

  addNode: (pos, kind) => {
    const def = kind ? graphOf(get()).kinds[kind] : undefined;
    const node =
      kind && def
        ? createNodeFromKind(kind, def, pos ?? randomPos())
        : createNode('新单元', pos ?? randomPos());
    get().commit({
      label: kind ? `新建${def?.name ?? kind}` : '新建单元',
      run: (g) => addNodeOp(g, node),
      revert: (g) => removeNodeOp(g, node.id),
    });
    set({ selectedNodes: [node.id], selectedEdge: null });
  },

  removeNode: (id) => get().removeNodes([id]),

  removeNodes: (ids) => {
    const g = graphOf(get());
    const doomed = new Set(ids);
    const nodes = g.nodes.filter((n) => doomed.has(n.id));
    if (!nodes.length) return;
    const edges = g.edges.filter((e) => doomed.has(e.from.node) || doomed.has(e.to.node));
    get().commit({
      label: nodes.length > 1 ? `删除 ${nodes.length} 个单元` : '删除单元',
      run: (gg) => removeNodesOp(gg, nodes.map((n) => n.id)),
      revert: (gg) => ({ ...gg, nodes: [...gg.nodes, ...nodes], edges: [...gg.edges, ...edges] }),
    });
    set({ selectedNodes: [], selectedEdge: null });
  },

  renameNode: (id, title) => {
    const node = findNode(graphOf(get()), id);
    if (!node || node.title === title) return;
    const old = node.title;
    get().commit({
      label: '重命名',
      mergeKey: `title:${id}`,
      run: (g) => renameNodeOp(g, id, title),
      revert: (g) => renameNodeOp(g, id, old),
    });
  },

  setKind: (id, kind) => {
    const node = findNode(graphOf(get()), id);
    if (!node) return;
    const old = node.kind ?? '';
    if (old === kind) return;
    get().commit({
      label: '改 kind',
      mergeKey: `kind:${id}`,
      run: (g) => setKindOp(g, id, kind),
      revert: (g) => setKindOp(g, id, old),
    });
  },

  silentMove: (id, pos) =>
    set({ graph: updateAtPath(get().graph, get().path, (g) => setNodePosOp(g, id, pos)) }),

  silentMoveMany: (moves) =>
    set({ graph: updateAtPath(get().graph, get().path, (g) => moveNodesOp(g, moves)) }),

  commitMove: (id, from, to) => get().commitMoveMany({ [id]: from }, { [id]: to }),

  commitMoveMany: (from, to) => {
    const ids = Object.keys(to).filter(
      (id) => from[id] && (from[id].x !== to[id].x || from[id].y !== to[id].y),
    );
    if (!ids.length) return;
    get().commit({
      label: ids.length > 1 ? `移动 ${ids.length} 个单元` : '移动单元',
      run: (g) => moveNodesOp(g, to),
      revert: (g) => moveNodesOp(g, from),
    });
  },

  moveNodes: (moves, label) => {
    const g = graphOf(get());
    const from: Record<string, Pos> = {};
    let changed = false;
    for (const [id, pos] of Object.entries(moves)) {
      const node = findNode(g, id);
      if (!node) continue;
      from[id] = node.pos;
      if (node.pos.x !== pos.x || node.pos.y !== pos.y) changed = true;
    }
    if (!changed) return;
    get().commit({
      label,
      run: (gg) => moveNodesOp(gg, moves),
      revert: (gg) => moveNodesOp(gg, from),
    });
  },

  addProp: (nodeId, name, type, value) => {
    const key = name.trim();
    if (!key) return;
    const node = findNode(graphOf(get()), nodeId);
    if (!node) return;
    if (node.props[key]) {
      set({ toast: `属性「${key}」已存在` });
      return;
    }
    const prop: PropMeta = { value, type };
    get().commit({
      label: '新增属性',
      run: (g) => setPropOp(g, nodeId, key, prop),
      revert: (g) => removePropOp(g, nodeId, key),
    });
  },

  setProp: (nodeId, name, value) => {
    const node = findNode(graphOf(get()), nodeId);
    if (!node) return;
    const old = node.props[name];
    const next: PropMeta = { ...(old ?? {}), value };
    get().commit({
      label: '改属性',
      mergeKey: `prop:${nodeId}:${name}`,
      run: (g) => setPropOp(g, nodeId, name, next),
      revert: (g) => (old ? setPropOp(g, nodeId, name, old) : removePropOp(g, nodeId, name)),
    });
  },

  removeProp: (nodeId, name) => {
    const node = findNode(graphOf(get()), nodeId);
    if (!node || !node.props[name]) return;
    const old = node.props[name];
    get().commit({
      label: '删属性',
      run: (g) => removePropOp(g, nodeId, name),
      revert: (g) => setPropOp(g, nodeId, name, old),
    });
  },

  addPort: (nodeId, dir) => {
    const port = createPort(dir);
    get().commit({
      label: dir === 'in' ? '加输入口' : '加输出口',
      run: (g) => addPortOp(g, nodeId, port),
      revert: (g) => removePortOp(g, nodeId, port.id),
    });
  },

  setPort: (nodeId, portId, patch) => {
    const graph = graphOf(get());
    const node = findNode(graph, nodeId);
    const old = node?.ports.find((p) => p.id === portId);
    if (!old) return;
    if (patch.dir && patch.dir !== old.dir) {
      const linked = graph.edges.some((e) => isPortEndpoint(e, nodeId, portId));
      if (linked) {
        set({ toast: '该端口还有连线，先改接或删除后再改方向' });
        return;
      }
    }
    if (patch.capacity === 'one' && old.dir === 'in' && old.capacity !== 'one') {
      const count = graph.edges.filter(
        (e) => !e.orphan && e.to.node === nodeId && e.to.port === portId,
      ).length;
      if (count > 1) {
        set({ toast: `该输入口上已有 ${count} 条连线，不能改成单条` });
        return;
      }
    }
    get().commit({
      label: '改端口',
      mergeKey: `port:${nodeId}:${portId}`,
      run: (g) => setPortOp(g, nodeId, portId, patch),
      revert: (g) => setPortOp(g, nodeId, portId, old),
    });
  },

  requestRemovePort: (nodeId, portId) => {
    const graph = graphOf(get());
    const port = findNode(graph, nodeId)?.ports.find((p) => p.id === portId);
    if (!port) return;
    const affected = graph.edges.filter((e) => isPortEndpoint(e, nodeId, portId));
    if (!affected.length) {
      get().commit({
        label: '删端口',
        run: (g) => removePortOp(g, nodeId, portId),
        revert: (g) => addPortOp(g, nodeId, port),
      });
      return;
    }
    set({ pendingPort: { nodeId, portId } });
  },

  confirmRemovePort: (target) => {
    const pending = get().pendingPort;
    if (!pending) return;
    const graph = graphOf(get());
    const { nodeId, portId } = pending;
    const node = findNode(graph, nodeId);
    const port = node?.ports.find((p) => p.id === portId);
    if (!node || !port) {
      set({ pendingPort: null });
      return;
    }
    const edgesBefore = graph.edges;
    const newPort =
      target.kind === 'new' ? createPort(port.dir, port.label, port.capacity) : undefined;
    const toPort =
      target.kind === 'rewire' ? target.portId : newPort ? newPort.id : undefined;

    const run = (g: Graph): Graph => {
      if (target.kind === 'orphan') return removePortOp(g, nodeId, portId);
      if (!toPort) {
        return removePortOp(removePortEdgesOp(g, nodeId, portId), nodeId, portId);
      }
      let next = replacePortInEdgesOp(g, nodeId, portId, toPort);
      if (newPort) next = addPortOp(next, nodeId, newPort);
      return removePortOp(next, nodeId, portId);
    };

    const revert = (g: Graph): Graph => ({
      ...g,
      nodes: g.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const ports = n.ports.filter((p) => !newPort || p.id !== newPort.id);
        return { ...n, ports: [...ports, port] };
      }),
      edges: edgesBefore,
    });

    get().commit({
      label:
        target.kind === 'rewire' || target.kind === 'new'
          ? '改接端口'
          : target.kind === 'orphan'
            ? '删端口（保留孤儿边）'
            : '删端口并删除关联边',
      run,
      revert,
    });
    set({ pendingPort: null, selectedEdge: null });
  },

  cancelRemovePort: () => set({ pendingPort: null }),

  connect: (from, to) => {
    const graph = graphOf(get());
    const error = validateConnection(graph, from, to);
    if (error) {
      const dup =
        error === '这条线已经存在'
          ? graph.edges.find(
              (e) =>
                !e.orphan &&
                e.from.node === from.node &&
                e.from.port === from.port &&
                e.to.node === to.node &&
                e.to.port === to.port,
            )
          : undefined;
      set(
        dup
          ? { toast: '这条线已经存在（已选中该连线）', selectedNodes: [], selectedEdge: dup.id }
          : { toast: error },
      );
      return;
    }
    const edge = createEdge(from, to);
    get().commit({
      label: '连线',
      run: (g) => addEdgeOp(g, edge),
      revert: (g) => removeEdgeOp(g, edge.id),
    });
  },

  removeEdge: (id) => {
    const edge = graphOf(get()).edges.find((e) => e.id === id);
    if (!edge) return;
    get().commit({
      label: '删连线',
      run: (g) => removeEdgeOp(g, id),
      revert: (g) => addEdgeOp(g, edge),
    });
  },

  setEdgeLabel: (id, label) => {
    const edge = graphOf(get()).edges.find((e) => e.id === id);
    if (!edge) return;
    const old = edge.label ?? '';
    if (old === label) return;
    get().commit({
      label: '改连线标签',
      mergeKey: `edge-label:${id}`,
      run: (g) => setEdgeLabelOp(g, id, label),
      revert: (g) => setEdgeLabelOp(g, id, old),
    });
  },

  clearOrphans: () => {
    const orphans = orphanEdges(graphOf(get()));
    if (!orphans.length) return;
    const ids = new Set(orphans.map((e) => e.id));
    get().commit({
      label: '清理孤儿边',
      run: (g) => ({ ...g, edges: g.edges.filter((e) => !ids.has(e.id)) }),
      revert: (g) => ({ ...g, edges: [...g.edges, ...orphans] }),
    });
  },

  applyKindTemplate: (nodeId) => {
    const node = findNode(graphOf(get()), nodeId);
    if (!node) return;
    const kind = node.kind?.trim();
    if (!kind) {
      set({ toast: '先设置 kind，再应用模板' });
      return;
    }
    const def = graphOf(get()).kinds[kind];
    if (!def) {
      set({ toast: `没有「${kind}」的模板` });
      return;
    }
    const next = withKindDefaults(node, def);
    get().commit({
      label: `应用模板「${def.name || kind}」`,
      run: (g) => replaceNodeOp(g, next),
      revert: (g) => replaceNodeOp(g, node),
    });
  },

  saveAsKind: (nodeId, rawName) => {
    const name = rawName.trim();
    if (!name) return;
    const graph = graphOf(get());
    const node = findNode(graph, nodeId);
    if (!node) return;
    const beforeKinds = graph.kinds;
    const def: KindDef = {
      name,
      defaults: JSON.parse(JSON.stringify(node.props)) as Record<string, PropMeta>,
      ports: node.ports.map((p) => ({
        dir: p.dir,
        label: p.label,
        capacity: p.capacity,
        ...(p.type ? { type: p.type } : {}),
      })),
    };
    const nextKinds = { ...beforeKinds, [name]: def };
    const previousKind = node.kind;
    get().commit({
      label: `存为模板「${name}」`,
      run: (g) => ({
        ...g,
        kinds: nextKinds,
        nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, kind: name } : n)),
      }),
      revert: (g) => ({
        ...g,
        kinds: beforeKinds,
        nodes: g.nodes.map((n) =>
          n.id === nodeId ? { ...n, kind: previousKind } : n,
        ),
      }),
    });
  },

  copy: () => {
    const ids = get().selectedNodes;
    if (!ids.length) {
      set({ toast: '先选中单元再复制' });
      return;
    }
    set({
      clipboard: copySelection(graphOf(get()), ids),
      pasteCount: 0,
      toast: `已复制 ${ids.length} 个单元`,
    });
  },

  paste: () => {
    const clip = get().clipboard;
    if (!clip || !clip.nodes.length) {
      set({ toast: '剪贴板为空' });
      return;
    }
    const round = get().pasteCount + 1;
    const { nodes, edges } = pasteClip(clip, { x: 32 * round, y: 32 * round });
    get().commit({
      label: `粘贴 ${nodes.length} 个单元`,
      run: (g) => ({
        ...g,
        nodes: [...g.nodes, ...nodes],
        edges: [...g.edges, ...edges],
      }),
      revert: (g) => removeNodesOp(g, nodes.map((n) => n.id)),
    });
    set({
      selectedNodes: nodes.map((n) => n.id),
      selectedEdge: null,
      pasteCount: round,
    });
  },

  load: (g) =>
    set({
      graph: g,
      past: [],
      future: [],
      selectedNodes: [],
      selectedEdge: null,
      pendingPort: null,
      pasteCount: 0,
      path: [],
      preview: false,
      filter: EMPTY_FILTER,
    }),

  saveToCache: () => saveCached(get().graph),

  enterSubgraph: (id) => {
    const node = findNode(graphOf(get()), id);
    if (!node?.subgraph) {
      set({ toast: '这个单元还没有子图' });
      return;
    }
    set({
      path: [...get().path, id],
      selectedNodes: [],
      selectedEdge: null,
      pendingPort: null,
      preview: false,
      filter: EMPTY_FILTER,
    });
  },

  goToPath: (depth) => {
    const path = get().path.slice(0, Math.max(0, Math.min(depth, get().path.length)));
    if (path.length === get().path.length) return;
    set({
      path,
      selectedNodes: [],
      selectedEdge: null,
      pendingPort: null,
      preview: false,
      filter: EMPTY_FILTER,
    });
  },

  setPreview: (on) => set({ preview: on, ...(on ? { pendingPort: null } : {}) }),

  addSubgraphNode: (pos) => {
    const base = graphOf(get());
    const node = createNode('子图', pos ?? randomPos());
    node.subgraph = { ...emptySubgraph(), kinds: { ...base.kinds } };
    node.ports = [createPort('in', '入口'), createPort('out', '出口')];
    get().commit({
      label: '新建子图',
      run: (g) => addNodeOp(g, node),
      revert: (g) => removeNodeOp(g, node.id),
    });
    set({ selectedNodes: [node.id], selectedEdge: null });
  },

  setSubgraphMap: (nodeId, portId, endpoint) => {
    const graph = graphOf(get());
    const node = findNode(graph, nodeId);
    if (!node) return;
    const before = node.subgraphMap ?? {};
    const after: Record<string, Endpoint> = { ...before };
    if (endpoint) {
      const inner = node.subgraph?.nodes.find((n) => n.id === endpoint.node);
      const innerPort = inner?.ports.find((p) => p.id === endpoint.port);
      const outer = node.ports.find((p) => p.id === portId);
      if (!innerPort || !outer) {
        set({ toast: '映射端点不存在' });
        return;
      }
      if (innerPort.dir !== outer.dir) {
        set({ toast: '只能映射到同方向的内部端口' });
        return;
      }
      after[portId] = { ...endpoint };
    } else {
      delete after[portId];
    }
    get().commit({
      label: endpoint ? '映射子图端口' : '取消端口映射',
      run: (g) => setSubgraphMapOp(g, nodeId, after),
      revert: (g) => setSubgraphMapOp(g, nodeId, before),
    });
  },
}));

/** 当前层图的订阅入口；根图与任意子图都用它读。 */
export function useCurrentGraph(): Graph {
  return useGraph((s) => graphOf(s));
}
