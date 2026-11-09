import { create } from 'zustand';
import { copySelection, pasteClip, type ClipPayload } from './model/clipboard';
import { pushEntry, type Entry, type EntryInput } from './model/history';
import { EMPTY_FILTER, type GraphFilter } from './model/query';
import {
  addEdgeOp, addNodeOp, addPortOp, createEdge, createNode, createNodeFromKind, createPort,
  findNode, isPortEndpoint, moveNodesOp, orphanEdges, removeEdgeOp, removeNodeOp, removeNodesOp,
  removePortEdgesOp, removePortOp, removePropOp, renameNodeOp, replaceNodeOp,
  replacePortInEdgesOp, setEdgeLabelOp, setKindOp, setNodePosOp, setPortOp,
  setPropOp, validateConnection, withKindDefaults,
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
    const entry: Entry = { ...input, at: Date.now() };
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
    set({
      graph: entry.revert(get().graph),
      past: past.slice(0, -1),
      future: [entry, ...get().future].slice(0, 100),
    });
  },

  redo: () => {
    const future = get().future;
    if (!future.length) return;
    const entry = future[0];
    set({
      graph: entry.run(get().graph),
      past: [...get().past, entry].slice(-100),
      future: future.slice(1),
    });
  },

  addNode: (pos, kind) => {
    const def = kind ? get().graph.kinds[kind] : undefined;
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
    const g = get().graph;
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
    const node = findNode(get().graph, id);
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
    const node = findNode(get().graph, id);
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

  silentMove: (id, pos) => set({ graph: setNodePosOp(get().graph, id, pos) }),

  silentMoveMany: (moves) => set({ graph: moveNodesOp(get().graph, moves) }),

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
    const g = get().graph;
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
    const node = findNode(get().graph, nodeId);
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
    const node = findNode(get().graph, nodeId);
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
    const node = findNode(get().graph, nodeId);
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
    const graph = get().graph;
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
    const graph = get().graph;
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
    const graph = get().graph;
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
    const error = validateConnection(get().graph, from, to);
    if (error) {
      set({ toast: error });
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
    const edge = get().graph.edges.find((e) => e.id === id);
    if (!edge) return;
    get().commit({
      label: '删连线',
      run: (g) => removeEdgeOp(g, id),
      revert: (g) => addEdgeOp(g, edge),
    });
  },

  setEdgeLabel: (id, label) => {
    const edge = get().graph.edges.find((e) => e.id === id);
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
    const orphans = orphanEdges(get().graph);
    if (!orphans.length) return;
    const ids = new Set(orphans.map((e) => e.id));
    get().commit({
      label: '清理孤儿边',
      run: (g) => ({ ...g, edges: g.edges.filter((e) => !ids.has(e.id)) }),
      revert: (g) => ({ ...g, edges: [...g.edges, ...orphans] }),
    });
  },

  applyKindTemplate: (nodeId) => {
    const node = findNode(get().graph, nodeId);
    if (!node) return;
    const kind = node.kind?.trim();
    if (!kind) {
      set({ toast: '先设置 kind，再应用模板' });
      return;
    }
    const def = get().graph.kinds[kind];
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
    const graph = get().graph;
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
      clipboard: copySelection(get().graph, ids),
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
    }),

  saveToCache: () => saveCached(get().graph),
}));
