import { create } from 'zustand';
import { layeredLayout } from './model/autolayout';
import { DEFAULT_MAPPING, validateMapping, type ExportMapping } from './model/mapping';
import { copySelection, pasteClip, type ClipPayload } from './model/clipboard';
import { pushEntry, type Entry, type EntryInput } from './model/history';
import { graphAtPath, normalizePath, updateAtPath } from './model/path';
import { planCrossLink, type CrossTarget } from './model/cross';
import { slotOf, templateResources, isRigged } from './model/modelTemplate';
import { EMPTY_FILTER, type GraphFilter } from './model/query';
import { emptySubgraph, parseGraph } from './model/schema';
import {
  addEdgeOp, addNodeOp, addPortOp, addResourceChildOp, addResourceOp, addResourceViewOp,
  createEdge, createNode, createNodeFromKind, createPort, createResource,
  removeResourceChildOp, removeResourceOp, removeResourceViewOp,
  setResourceChildOp, setResourceOp, setResourceViewOp,
  findNode, isPortEndpoint, moveNodesOp, orphanEdges, removeEdgeOp, removeNodeOp, removeNodesOp,
  removePortEdgesOp, removePortOp, removePropOp, renameNodeOp, replaceNodeOp,
  replacePortInEdgesOp, setEdgeLabelOp, setKindOp, setNodePosOp, setPortOp,
  setBoundaryPosOp, setPropOp, setSubgraphMapOp, validateConnection, withKindDefaults,
} from './model/ops';
import { sampleGraph } from './model/sample';
import {
  formatTime, loadSnapshots, newSnapshot, persistSnapshots, pushSnapshot, type Snapshot,
} from './model/snapshot';
import {
  activeGraph as projectActiveGraph, addGraph as projectAddGraph,
  projectFromGraph, removeGraph as projectRemoveGraph, renameGraph as projectRenameGraph,
  parseProjectDoc, syncActive, switchGraph as switchProjectGraph, unifyKinds, type ProjectGraph,
} from './model/project';
import { EMPTY_STYLE, type ProjectStyle } from './model/style';
import {
  activateProvider as activateProviderIn, loadProviders, newProvider, saveProviders,
  type Capability, type ProviderConfig,
} from './model/providers';
import { loadCached, loadProject, pickGraphFile, saveCached, saveProject as saveProjectDoc } from './persistence';
import { DiskFS } from './fs/disk';
import { graphDirName, hasFolderProject, nodeDirName, readProject, resourceFileName, writeProject } from './model/folder';
import { clearFolderHandle, loadFolderHandle, saveFolderHandle } from './fs/handleStore';
import { joinPath } from './fs/types';
import type { Endpoint, Graph, KindDef, PropMeta, ResourceItem, ResourceType, UnitNode, UnitPort } from './model/types';
import type { SortDir } from './model/table';

export type ViewMode = 'graph' | 'table';

/** 目录项目绑定：句柄只在会话内保存，重新打开应用需再选一次目录。 */
let folderHandle: FileSystemDirectoryHandle | null = null;
let projectFileHandle: FileSystemFileHandle | null = null;
const resourceFiles = new Map<string, File>();
let folderSyncTimer: ReturnType<typeof setTimeout> | null = null;
let folderSyncRunning = false;
let folderSyncQueued = false;

function scheduleFolderSync(): void {
  if (!folderHandle) return;
  if (folderSyncTimer) clearTimeout(folderSyncTimer);
  folderSyncTimer = setTimeout(() => {
    folderSyncTimer = null;
    void flushFolderSync();
  }, 300);
}

async function flushFolderSync(): Promise<void> {
  if (!folderHandle) return;
  if (folderSyncRunning) {
    folderSyncQueued = true;
    return;
  }
  folderSyncRunning = true;
  try {
    await writeProject(new DiskFS(folderHandle), useGraph.getState().currentProject());
  } catch (error) {
    useGraph.getState().toastOf(`目录同步失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    folderSyncRunning = false;
    if (folderSyncQueued) {
      folderSyncQueued = false;
      scheduleFolderSync();
    }
  }
}

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
  /** 图 / 表格两种投影 */
  view: ViewMode;
  /** 影响面只读高亮开关 */
  impactOn: boolean;
  impactDepth: number;
  tableSort: { key: string; dir: SortDir } | null;
  /** 表格里被隐藏的列 key */
  hiddenColumns: string[];
  /** 切回图视图后需要定位的节点（一次性） */
  focus: string | null;
  /** 导出 dry-run 对话框 */
  exportOpen: boolean;
  /** 资源风格对话框 */
  styleOpen: boolean;
  openStyle(open?: boolean): void;
  /** 全局生成服务（图片/3D）：存 localStorage，不属于项目文件 */
  providers: ProviderConfig[];
  providersOpen: boolean;
  openProviders(open?: boolean): void;
  addProvider(capability?: Capability): void;
  updateProvider(id: string, patch: Partial<Omit<ProviderConfig, 'id'>>): void;
  removeProvider(id: string): void;
  activateProvider(id: string): void;
  /** 正在为哪条资源打开生成对话框 */
  generateTarget: { nodeId: string; resourceId: string; groupId?: string } | null;
  openGenerate(nodeId: string, resourceId: string, groupId?: string): void;
  closeGenerate(): void;
  /** 本地版本快照（最新在前，最多 SNAPSHOT_LIMIT 份） */
  snapshots: Snapshot[];
  snapshotOpen: boolean;
  folderName: string | null;
  fileName: string | null;
  /** 打开的单个文件引用了目录资源时，提示去绑定项目文件夹（值为资源数量，0 表示关闭）。 */
  assetPrompt: number;
  dismissAssetPrompt(): void;
  folderError: string | null;
  clearFolderError(): void;
  /** 多图容器：一个 project 下的所有根图（当前图另外存在 graph 里） */
  projectGraphs: ProjectGraph[];
  activeGraphId: string;
  /** 资源全局风格：所有图标/模型的描述词都继承它 */
  projectStyle: ProjectStyle;
  setProjectStyle(patch: Partial<ProjectStyle>): void;
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
  silentMoveBoundary(side: 'in' | 'out', pos: Pos): void;
  commitMoveBoundary(side: 'in' | 'out', from: Pos, to: Pos): void;
  moveNodes(moves: Record<string, Pos>, label: string): void;
  autoLayout(): void;
  addProp(nodeId: string, name: string, type: string, value: unknown): void;
  addResource(nodeId: string, type: ResourceType, init?: Partial<Pick<ResourceItem, 'label' | 'path'>>): void;
  setResource(nodeId: string, resourceId: string, patch: Partial<Omit<ResourceItem, 'id'>>): void;
  removeResource(nodeId: string, resourceId: string): void;
  importResourceFile(nodeId: string, resourceId: string, file: File): Promise<void>;
  /** 资源项的子资源（图片容器里的视图） */
  addResourceView(nodeId: string, resourceId: string): void;
  /** 在图片容器里新建分组（分组自己装描述词与图片子项） */
  addResourceGroup(nodeId: string, resourceId: string): void;
  addResourceChild(nodeId: string, resourceId: string, groupId: string): void;
  setResourceChild(
    nodeId: string,
    resourceId: string,
    groupId: string,
    childId: string,
    patch: Partial<Omit<ResourceItem, 'id'>>,
  ): void;
  removeResourceChild(nodeId: string, resourceId: string, groupId: string, childId: string): void;
  importResourceChildFile(nodeId: string, resourceId: string, groupId: string, childId: string, file: File): void;
  applyGeneratedChild(
    nodeId: string,
    resourceId: string,
    groupId: string,
    file: File,
    label?: string,
  ): void;
  setResourceView(nodeId: string, resourceId: string, viewId: string, patch: Partial<Omit<ResourceItem, 'id'>>): void;
  removeResourceView(nodeId: string, resourceId: string, viewId: string): void;
  importResourceViewFile(nodeId: string, resourceId: string, viewId: string, file: File): void;
  /** 把生成结果直接加为这条资源的视图（一次提交） */
  applyGeneratedView(nodeId: string, resourceId: string, file: File, label?: string): void;
  applyModelTemplate(nodeId: string, opts: { rig: boolean; scene: boolean }): void;
  setProp(nodeId: string, name: string, value: unknown): void;
  setPropMany(ids: string[], name: string, type: string, value: unknown): void;
  removeProp(nodeId: string, name: string): void;
  setView(view: ViewMode): void;
  setImpactOn(on: boolean): void;
  setImpactDepth(depth: number): void;
  setTableSort(key: string | null): void;
  toggleColumn(key: string): void;
  resetColumns(): void;
  setFocus(id: string | null): void;
  setExportOpen(open: boolean): void;
  mapping: ExportMapping;
  setMapping(mapping: ExportMapping): void;
  resetMapping(): void;
  openSnapshots(open?: boolean): void;
  takeSnapshot(label?: string): void;
  restoreSnapshot(id: string): void;
  deleteSnapshot(id: string): void;
  switchGraph(id: string): void;
  addGraph(name?: string): void;
  importGraph(name?: string): Promise<void>;
  renameGraph(name: string): void;
  removeGraph(): void;
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
  /** 载入任意 JSON：project 文档（多图）或单图；返回是否为多图。 */
  loadFile(raw: unknown, handle?: FileSystemFileHandle): boolean;
  openProjectFile(): Promise<void>;
  saveToCache(): void;
  currentProject(): import('./model/project').ProjectDoc;
  saveToFolder(preset?: FileSystemDirectoryHandle): Promise<void>;
  /** 有绑定目录就写目录，否则下载项目文件。 */
  saveCurrentProject(): void;
  /** 清空当前编辑，开一个只有一张空白图的本地项目（不落盘）。 */
  newProject(): void;
  newProjectOpen: boolean;
  openNewProject(): void;
  closeNewProject(): void;
  openFolder(): Promise<void>;
  unbindFolder(): void;
  /** 直接用一个已拿到的目录句柄打开项目（拖拽/选择器共用）。 */
  openDirectory(handle: FileSystemDirectoryHandle): Promise<void>;
  reloadFolder(): Promise<void>;
  readFolderAsset(nodeId: string, resource: ResourceItem): Promise<Blob | null>;
  folderAssetPath(nodeId: string, resource: ResourceItem): string | null;
  enterSubgraph(id: string): void;
  goToPath(depth: number): void;
  setPreview(on: boolean): void;
  addSubgraphNode(pos?: Pos): void;
  setSubgraphMap(nodeId: string, portId: string, endpoint: Endpoint | null): void;
  /** 在子图层内映射“外层端口 → 本层端点”，历史挂在父层操作上。 */
  setOuterMap(portId: string, endpoint: Endpoint | null): void;
  /** 跨子图连线：源是当前子图内部输出端口，落点是另一子图内部的输入端口。 */
  linkCrossSubgraph(source: Endpoint, target: CrossTarget): void;
}

/** 当前层图（根 / 子图）；组件统一通过它读，写操作由 commit 自动映射回根。 */
export function graphOf(state: { graph: Graph; path: string[] }): Graph {
  return graphAtPath(state.graph, state.path) ?? state.graph;
}

const MAPPING_KEY = 'nodeworks.mapping.v1';

function loadMapping(): ExportMapping {
  if (typeof localStorage === 'undefined') return DEFAULT_MAPPING;
  try {
    const raw = localStorage.getItem(MAPPING_KEY);
    if (!raw) return DEFAULT_MAPPING;
    return validateMapping(JSON.parse(raw));
  } catch {
    return DEFAULT_MAPPING;
  }
}

function randomPos(): Pos {
  return { x: 160 + Math.random() * 240, y: 140 + Math.random() * 160 };
}

async function restoreFolder() {
  const handle = await loadFolderHandle().catch(() => null);
  if (!handle) return;
  const perm = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt';
  if (perm !== 'granted') return;
  try {
    const project = await readProject(new DiskFS(handle));
    if (useGraph.getState().past.length || useGraph.getState().future.length) return;
    folderHandle = handle;
    const active = projectActiveGraph(project);
    useGraph.setState({
      graph: active.graph,
      projectGraphs: project.graphs,
      activeGraphId: active.id,
      projectStyle: project.style ?? { ...EMPTY_STYLE },
      folderName: handle.name,
    });
  } catch {
    /* 目录不存在或结构变了：保持单文件状态 */
  }
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
  view: 'graph',
  impactOn: false,
  impactDepth: 2,
  tableSort: null,
  hiddenColumns: [],
  focus: null,
  exportOpen: false,
  styleOpen: false,
  providers: loadProviders(),
  providersOpen: false,
  generateTarget: null,
  mapping: loadMapping(),
  snapshots: [],
  snapshotOpen: false,
  folderName: null,
  fileName: null,
  assetPrompt: 0,
  folderError: null,
  newProjectOpen: false,
  projectGraphs: [],
  activeGraphId: '',
  projectStyle: { ...EMPTY_STYLE },

  boot: () => {
    if (get().booted) return;
    const project = loadProject();
    if (project) {
      const active = projectActiveGraph(project);
      set({
        graph: active.graph,
        projectGraphs: project.graphs,
        activeGraphId: active.id,
        projectStyle: project.style ?? { ...EMPTY_STYLE },
        booted: true,
        snapshots: loadSnapshots(),
      });
      void restoreFolder();
      return;
    }
    const seeded = projectFromGraph(loadCached() ?? sampleGraph());
    const active = projectActiveGraph(seeded);
    set({
      graph: active.graph,
      projectGraphs: seeded.graphs,
      activeGraphId: active.id,
      projectStyle: seeded.style ?? { ...EMPTY_STYLE },
      booted: true,
      snapshots: loadSnapshots(),
    });
    void restoreFolder();
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
    scheduleFolderSync();
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
    scheduleFolderSync();
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
    scheduleFolderSync();
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

  silentMoveBoundary: (side, pos) => {
    const { path, graph } = get();
    if (!path.length) return;
    const parentPath = path.slice(0, -1);
    const nodeId = path[path.length - 1];
    set({
      graph: updateAtPath(graph, parentPath, (g) => setBoundaryPosOp(g, nodeId, side, pos)),
    });
  },

  commitMoveBoundary: (side, from, to) => {
    if (from.x === to.x && from.y === to.y) return;
    const state = get();
    const { path } = state;
    if (!path.length) return;
    // 代理节点属于“父节点”，不在当前层图里；所以直接压根图快照，不走 commit 的路径抬升。
    const parentPath = path.slice(0, -1);
    const nodeId = path[path.length - 1];
    const beforeGraph = updateAtPath(state.graph, parentPath, (pg) =>
      setBoundaryPosOp(pg, nodeId, side, from),
    );
    const afterGraph = updateAtPath(state.graph, parentPath, (pg) =>
      setBoundaryPosOp(pg, nodeId, side, to),
    );
    const entry: Entry = {
      label: side === 'in' ? '移动外层输入' : '移动外层输出',
      run: () => afterGraph,
      revert: () => beforeGraph,
      at: Date.now(),
    };
    set({ graph: afterGraph, past: pushEntry(state.past, entry), future: [] });
  },

  autoLayout: () => {
    const graph = graphOf(get());
    if (!graph.nodes.length) return;
    const { positions } = layeredLayout(graph);
    get().moveNodes(positions, '自动布局');
    set({ toast: '已自动布局（⌘Z 可撤销）' });
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

  addResource: (nodeId, type, init) => {
    const label = init?.label?.trim();
    const item = createResource(type, label || undefined);
    const path = init?.path?.trim();
    if (path) item.path = path;
    get().commit({
      label: '添加资源项',
      run: (g) => addResourceOp(g, nodeId, item),
      revert: (g) => removeResourceOp(g, nodeId, item.id),
    });
  },

  setResource: (nodeId, resourceId, patch) => {
    const node = findNode(graphOf(get()), nodeId);
    const old = node?.resources?.find((r) => r.id === resourceId);
    if (!node || !old) return;
    const field = Object.keys(patch).join(',');
    get().commit({
      label: '改资源项',
      mergeKey: `res:${nodeId}:${resourceId}:${field}`,
      run: (g) => setResourceOp(g, nodeId, resourceId, patch),
      revert: (g) => setResourceOp(g, nodeId, resourceId, old),
    });
  },

  removeResource: (nodeId, resourceId) => {
    const node = findNode(graphOf(get()), nodeId);
    const old = node?.resources?.find((r) => r.id === resourceId);
    if (!old) return;
    get().commit({
      label: '删除资源项',
      run: (g) => removeResourceOp(g, nodeId, resourceId),
      revert: (g) => addResourceOp(g, nodeId, old),
    });
  },

  importResourceFile: async (nodeId, resourceId, file) => {
    const node = findNode(graphOf(get()), nodeId);
    const old = node?.resources?.find((r) => r.id === resourceId);
    if (!node || !old) return;
    resourceFiles.set(`${nodeId}:${resourceId}`, file);
    const patch = { path: `assets/${file.name}`, file: undefined };
    get().commit({
      label: '导入资源文件',
      run: (g) => setResourceOp(g, nodeId, resourceId, patch),
      revert: (g) => setResourceOp(g, nodeId, resourceId, old),
    });
    get().toastOf(`已导入 ${file.name}`);
  },

  addResourceView: (nodeId, resourceId) => {
    const node = findNode(graphOf(get()), nodeId);
    const resource = node?.resources?.find((r) => r.id === resourceId);
    if (!resource) return;
    const view = createResource('image', `视图 ${(resource.views?.length ?? 0) + 1}`);
    get().commit({
      label: '添加视图',
      run: (g) => addResourceViewOp(g, nodeId, resourceId, view),
      revert: (g) => removeResourceViewOp(g, nodeId, resourceId, view.id),
    });
  },

  setResourceView: (nodeId, resourceId, viewId, patch) => {
    const node = findNode(graphOf(get()), nodeId);
    const old = node?.resources?.find((r) => r.id === resourceId)?.views?.find((v) => v.id === viewId);
    if (!old) return;
    const field = Object.keys(patch).join(',');
    get().commit({
      label: '改视图',
      mergeKey: `view:${nodeId}:${resourceId}:${viewId}:${field}`,
      run: (g) => setResourceViewOp(g, nodeId, resourceId, viewId, patch),
      revert: (g) => setResourceViewOp(g, nodeId, resourceId, viewId, old),
    });
  },

  removeResourceView: (nodeId, resourceId, viewId) => {
    const node = findNode(graphOf(get()), nodeId);
    const old = node?.resources?.find((r) => r.id === resourceId)?.views?.find((v) => v.id === viewId);
    if (!old) return;
    get().commit({
      label: '删除视图',
      run: (g) => removeResourceViewOp(g, nodeId, resourceId, viewId),
      revert: (g) => addResourceViewOp(g, nodeId, resourceId, old),
    });
  },

  addResourceGroup: (nodeId, resourceId) => {
    const resource = findNode(graphOf(get()), nodeId)?.resources?.find((r) => r.id === resourceId);
    if (!resource) return;
    const group = createResource('other', `分组 ${(resource.views?.length ?? 0) + 1}`);
    group.path = '';
    group.group = true;
    group.views = [];
    get().commit({
      label: '添加分组',
      run: (g) => addResourceViewOp(g, nodeId, resourceId, group),
      revert: (g) => removeResourceViewOp(g, nodeId, resourceId, group.id),
    });
  },

  addResourceChild: (nodeId, resourceId, groupId) => {
    const group = findNode(graphOf(get()), nodeId)?.resources
      ?.find((r) => r.id === resourceId)?.views?.find((v) => v.id === groupId);
    if (!group) return;
    const child = createResource('image', `图 ${(group.views?.length ?? 0) + 1}`);
    get().commit({
      label: '添加分组图片',
      run: (g) => addResourceChildOp(g, nodeId, resourceId, groupId, child),
      revert: (g) => removeResourceChildOp(g, nodeId, resourceId, groupId, child.id),
    });
  },

  setResourceChild: (nodeId, resourceId, groupId, childId, patch) => {
    const old = findNode(graphOf(get()), nodeId)?.resources
      ?.find((r) => r.id === resourceId)?.views?.find((v) => v.id === groupId)
      ?.views?.find((c) => c.id === childId);
    if (!old) return;
    get().commit({
      label: '改分组图片',
      mergeKey: `child:${nodeId}:${resourceId}:${groupId}:${childId}:${Object.keys(patch).join(',')}`,
      run: (g) => setResourceChildOp(g, nodeId, resourceId, groupId, childId, patch),
      revert: (g) => setResourceChildOp(g, nodeId, resourceId, groupId, childId, old),
    });
  },

  removeResourceChild: (nodeId, resourceId, groupId, childId) => {
    const old = findNode(graphOf(get()), nodeId)?.resources
      ?.find((r) => r.id === resourceId)?.views?.find((v) => v.id === groupId)
      ?.views?.find((c) => c.id === childId);
    if (!old) return;
    get().commit({
      label: '删除分组图片',
      run: (g) => removeResourceChildOp(g, nodeId, resourceId, groupId, childId),
      revert: (g) => addResourceChildOp(g, nodeId, resourceId, groupId, old),
    });
  },

  importResourceChildFile: (nodeId, resourceId, groupId, childId, file) => {
    const old = findNode(graphOf(get()), nodeId)?.resources
      ?.find((r) => r.id === resourceId)?.views?.find((v) => v.id === groupId)
      ?.views?.find((c) => c.id === childId);
    if (!old) return;
    resourceFiles.set(`${nodeId}:${childId}`, file);
    get().commit({
      label: '导入分组图片',
      run: (g) => setResourceChildOp(g, nodeId, resourceId, groupId, childId, { path: `assets/${file.name}`, file: undefined }),
      revert: (g) => setResourceChildOp(g, nodeId, resourceId, groupId, childId, old),
    });
  },

  applyGeneratedChild: (nodeId, resourceId, groupId, file, label) => {
    const group = findNode(graphOf(get()), nodeId)?.resources
      ?.find((r) => r.id === resourceId)?.views?.find((v) => v.id === groupId);
    if (!group) return;
    const child = createResource('image', label || `图 ${(group.views?.length ?? 0) + 1}`);
    child.path = `assets/${file.name}`;
    resourceFiles.set(`${nodeId}:${child.id}`, file);
    get().commit({
      label: '添加生成图片',
      run: (g) => addResourceChildOp(g, nodeId, resourceId, groupId, child),
      revert: (g) => removeResourceChildOp(g, nodeId, resourceId, groupId, child.id),
    });
  },

  importResourceViewFile: (nodeId, resourceId, viewId, file) => {
    const node = findNode(graphOf(get()), nodeId);
    const old = node?.resources?.find((r) => r.id === resourceId)?.views?.find((v) => v.id === viewId);
    if (!old) return;
    resourceFiles.set(`${nodeId}:${viewId}`, file);
    const patch = { path: `assets/${file.name}`, file: undefined };
    get().commit({
      label: '导入视图文件',
      run: (g) => setResourceViewOp(g, nodeId, resourceId, viewId, patch),
      revert: (g) => setResourceViewOp(g, nodeId, resourceId, viewId, old),
    });
    get().toastOf(`已导入 ${file.name}`);
  },

  applyGeneratedView: (nodeId, resourceId, file, label) => {
    const node = findNode(graphOf(get()), nodeId);
    const resource = node?.resources?.find((r) => r.id === resourceId);
    if (!resource) return;
    const view = createResource('image', label || `视图 ${(resource.views?.length ?? 0) + 1}`);
    view.path = `assets/${file.name}`;
    // 生成结果的字节先进会话缓存，保存目录项目时由 readResource 落盘
    resourceFiles.set(`${nodeId}:${view.id}`, file);
    const concept = resource.views?.find((v) => v.group && v.label === '概念图');
    if (concept) {
      get().commit({
        label: '添加概念图',
        run: (g) => addResourceChildOp(g, nodeId, resourceId, concept.id, view),
        revert: (g) => removeResourceChildOp(g, nodeId, resourceId, concept.id, view.id),
      });
      return;
    }
    const group = createResource('other', '概念图');
    group.path = '';
    group.group = true;
    group.views = [view];
    get().commit({
      label: '添加概念图',
      run: (g) => addResourceViewOp(g, nodeId, resourceId, group),
      revert: (g) => removeResourceViewOp(g, nodeId, resourceId, group.id),
    });
  },

  applyModelTemplate: (nodeId, opts) => {
    const node = findNode(graphOf(get()), nodeId);
    if (!node) return;
    const before = structuredClone(node);
    const missing = templateResources(node, opts);
    const merged = [...(node.resources ?? []), ...missing].map((r) => {
      if (slotOf(r) !== 'mesh') return r;
      return { ...r, slot: r.slot ?? 'mesh', meta: { ...(r.meta ?? {}), rigged: opts.rig } };
    });
    const rigChanged = isRigged(node) !== opts.rig;
    if (!missing.length && !rigChanged) {
      set({ toast: '通配清单已经齐全' });
      return;
    }
    const next = { ...node, resources: merged };
    get().commit({
      label: '套用模型通配',
      run: (g) => replaceNodeOp(g, next),
      revert: (g) => replaceNodeOp(g, before),
    });
    set({ toast: missing.length ? `已补齐 ${missing.length} 项资源` : opts.rig ? '已标记为角色模型' : '已更新模型标记' });
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

  setPropMany: (ids, rawName, type, value) => {
    const name = rawName.trim();
    if (!name) {
      set({ toast: '属性名不能为空' });
      return;
    }
    const targets = graphOf(get()).nodes.filter((n) => ids.includes(n.id));
    if (!targets.length) return;
    const olds = new Map(targets.map((n) => [n.id, n.props[name]] as const));
    get().commit({
      label: `批量改「${name}」（${targets.length} 个单元）`,
      run: (g) => {
        let next = g;
        for (const node of targets) {
          next = setPropOp(next, node.id, name, { ...(node.props[name] ?? {}), type, value });
        }
        return next;
      },
      revert: (g) => {
        let next = g;
        for (const node of targets) {
          const old = olds.get(node.id);
          next = old ? setPropOp(next, node.id, name, old) : removePropOp(next, node.id, name);
        }
        return next;
      },
    });
    set({ toast: `已更新 ${targets.length} 个单元的「${name}」` });
  },

  setView: (view) => set({ view }),

  setImpactOn: (on) => set({ impactOn: on }),

  setImpactDepth: (depth) => {
    const rounded = Math.floor(depth);
    set({ impactDepth: Number.isFinite(rounded) ? Math.max(1, Math.min(5, rounded)) : 2 });
  },

  setTableSort: (key) => {
    if (!key) {
      set({ tableSort: null });
      return;
    }
    const current = get().tableSort;
    set({
      tableSort:
        current?.key === key
          ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
          : { key, dir: 'asc' },
    });
  },

  toggleColumn: (key) =>
    set({
      hiddenColumns: get().hiddenColumns.includes(key)
        ? get().hiddenColumns.filter((k) => k !== key)
        : [...get().hiddenColumns, key],
    }),

  resetColumns: () => set({ hiddenColumns: [] }),

  setFocus: (id) => set({ focus: id }),

  setExportOpen: (open) => set({ exportOpen: open }),

  openStyle: (open) => set({ styleOpen: open ?? !get().styleOpen }),

  openProviders: (open) => set({ providersOpen: open ?? !get().providersOpen }),

  addProvider: (capability = 'image') => {
    const provider = newProvider(capability);
    let list = [...get().providers, provider];
    // 该能力还没有启用的服务时，新加的这条直接启用
    if (!list.some((p) => p.capability === capability && p.active)) {
      list = list.map((p) => (p.id === provider.id ? { ...p, active: true } : p));
    }
    set({ providers: list });
    saveProviders(list);
  },

  updateProvider: (id, patch) => {
    const list = get().providers.map((p) => (p.id === id ? { ...p, ...patch } : p));
    set({ providers: list });
    saveProviders(list);
  },

  removeProvider: (id) => {
    const before = get().providers;
    const removed = before.find((p) => p.id === id);
    let list = before.filter((p) => p.id !== id);
    if (removed?.active) {
      const fallback = list.find((p) => p.capability === removed.capability);
      if (fallback) list = list.map((p) => (p.id === fallback.id ? { ...p, active: true } : p));
    }
    set({ providers: list });
    saveProviders(list);
  },

  activateProvider: (id) => {
    const list = activateProviderIn(get().providers, id);
    set({ providers: list });
    saveProviders(list);
  },

  openGenerate: (nodeId, resourceId, groupId) => set({ generateTarget: { nodeId, resourceId, groupId } }),
  closeGenerate: () => set({ generateTarget: null }),

  setProjectStyle: (patch) => {
    set({ projectStyle: { ...get().projectStyle, ...patch } });
    // 风格不属于图历史，单独落盘：目录项目走同步，单文件项目写 localStorage 缓存
    saveProjectDoc(get().currentProject());
    scheduleFolderSync();
  },

  setMapping: (mapping) => {
    try {
      localStorage.setItem(MAPPING_KEY, JSON.stringify(mapping));
    } catch {
      /* 忽略配额错误，仅本次会话生效 */
    }
    set({ mapping, toast: `已载入映射「${mapping.target}」` });
  },

  resetMapping: () => {
    try {
      localStorage.removeItem(MAPPING_KEY);
    } catch {
      /* ignore */
    }
    set({ mapping: DEFAULT_MAPPING, toast: '已恢复默认映射' });
  },

  openSnapshots: (open) => set({ snapshotOpen: open ?? !get().snapshotOpen }),

  takeSnapshot: (label) => {
    const snap = newSnapshot(get().graph, label?.trim() || `快照 ${formatTime(Date.now())}`);
    const list = pushSnapshot(get().snapshots, snap);
    const saved = persistSnapshots(list);
    set({ snapshots: list });
    set({
      toast: saved
        ? `已保存快照「${snap.label}」`
        : `已保存快照「${snap.label}」（仅本次会话）`,
    });
  },

  restoreSnapshot: (id) => {
    const snap = get().snapshots.find((item) => item.id === id);
    if (!snap) return;
    const before = get().graph;
    // 回滚永远作用于根图，先退出子图层再提交，历史里是根图整体替换。
    set({
      path: [],
      preview: false,
      selectedNodes: [],
      selectedEdge: null,
      pendingPort: null,
      filter: EMPTY_FILTER,
      snapshotOpen: false,
    });
    get().commit({
      label: `回滚到「${snap.label}」`,
      run: () => JSON.parse(JSON.stringify(snap.graph)) as Graph,
      revert: () => before,
    });
    set({ toast: `已回滚到「${snap.label}」（⌘Z 可撤销）` });
  },

  deleteSnapshot: (id) => {
    const snap = get().snapshots.find((item) => item.id === id);
    const list = get().snapshots.filter((item) => item.id !== id);
    persistSnapshots(list);
    set({ snapshots: list });
    if (snap) set({ toast: `已删除快照「${snap.label}」` });
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
      impactOn: false,
      tableSort: null,
      hiddenColumns: [],
      focus: null,
      exportOpen: false,
      snapshotOpen: false,
      providersOpen: false,
      generateTarget: null,
      folderName: null,
      fileName: null,
      assetPrompt: 0,
      folderError: null,
      ...(() => {
        const seeded = projectFromGraph(g);
        return {
          projectGraphs: seeded.graphs,
          activeGraphId: seeded.active,
          projectStyle: seeded.style ?? { ...EMPTY_STYLE },
        };
      })(),
    }),

  loadFile: (raw, handle) => {
    get().unbindFolder();
    projectFileHandle = handle ?? null;
    set({ fileName: handle?.name ?? null });
    const project = parseProjectDoc(raw);
    if (project) {
      const active = projectActiveGraph(project);
      get().load(active.graph);
      const fileCount = project.graphs.reduce(
        (sum, pg) => sum + pg.graph.nodes.reduce((n, node) => n + (node.resources?.length ?? 0), 0),
        0,
      );
      set({
        graph: active.graph,
        projectGraphs: project.graphs,
        activeGraphId: project.active,
        projectStyle: project.style ?? { ...EMPTY_STYLE },
        assetPrompt: fileCount,
        toast: `已载入项目「${project.graphs.find((g) => g.id === project.active)?.name ?? ''}」· 共 ${project.graphs.length} 张图${
          fileCount ? '；资源文件需绑定项目文件夹才能预览' : ''
        }`,
      });
      return true;
    }
    const single = parseGraph(raw);
    get().load(single);
    const fileCount = single.nodes.reduce((n, node) => n + (node.resources?.length ?? 0), 0);
    set({
      assetPrompt: fileCount,
      toast: fileCount ? '已载入图；资源文件需绑定项目文件夹才能预览' : '已载入图',
    });
    return false;
  },

  switchGraph: (id) => {
    const { graph, projectGraphs, activeGraphId } = get();
    if (id === activeGraphId) return;
    const synced = syncActive(
      { version: 1, active: activeGraphId, graphs: projectGraphs, style: get().projectStyle },
      graph,
      activeGraphId,
    );
    const next = switchProjectGraph(synced, id);
    if (!next) return;
    const active = projectActiveGraph(next);
    set({
      graph: active.graph,
      projectGraphs: next.graphs,
      activeGraphId: next.active,
      past: [],
      future: [],
      selectedNodes: [],
      selectedEdge: null,
      pendingPort: null,
      path: [],
      preview: false,
      filter: EMPTY_FILTER,
      focus: null,
      impactOn: false,
      tableSort: null,
      hiddenColumns: [],
      toast: `切换到「${active.name}」`,
    });
  },

  addGraph: (name) => {
    const { graph, projectGraphs, activeGraphId } = get();
    const synced = syncActive(
      { version: 1, active: activeGraphId, graphs: projectGraphs, style: get().projectStyle },
      graph,
      activeGraphId,
    );
    if (synced.graphs.length >= 24) {
      set({ toast: '一个 project 最多 24 张图' });
      return;
    }
    const created = projectAddGraph(synced, name);
    const active = projectActiveGraph(created.project);
    set({
      graph: active.graph,
      projectGraphs: created.project.graphs,
      activeGraphId: active.id,
      past: [],
      future: [],
      selectedNodes: [],
      selectedEdge: null,
      pendingPort: null,
      path: [],
      preview: false,
      filter: EMPTY_FILTER,
      focus: null,
      impactOn: false,
      tableSort: null,
      hiddenColumns: [],
      toast: `已新建「${active.name}」`,
    });
    saveProjectDoc(created.project);
  },

  importGraph: async (name) => {
    let imported;
    try {
      imported = await pickGraphFile();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail !== '没有选择文件') set({ toast: `导入图失败：${detail}` });
      return;
    }
    const { graph, projectGraphs, activeGraphId } = get();
    const synced = syncActive(
      { version: 1, active: activeGraphId, graphs: projectGraphs, style: get().projectStyle },
      graph,
      activeGraphId,
    );
    if (synced.graphs.length >= 24) {
      set({ toast: '一个 project 最多 24 张图' });
      return;
    }
    const created = projectAddGraph(synced, name?.trim() || undefined);
    const importedId = created.project.active;
    const unified = unifyKinds({
      ...created.project,
      graphs: created.project.graphs.map((pg) =>
        pg.id === importedId
          ? { ...pg, graph: { ...imported, kinds: { ...pg.graph.kinds, ...imported.kinds } } }
          : pg,
      ),
    });
    const active = projectActiveGraph(unified);
    set({
      graph: active.graph,
      projectGraphs: unified.graphs,
      activeGraphId: active.id,
      past: [],
      future: [],
      selectedNodes: [],
      selectedEdge: null,
      pendingPort: null,
      path: [],
      preview: false,
      filter: EMPTY_FILTER,
      focus: null,
      impactOn: false,
      tableSort: null,
      hiddenColumns: [],
      toast: `已导入「${active.name}」· ${active.graph.nodes.length} 个单元`,
    });
    saveProjectDoc(unified);
  },

  renameGraph: (name) => {
    const { projectGraphs, activeGraphId } = get();
    const before = projectGraphs.find((pg) => pg.id === activeGraphId);
    if (!before) return;
    const project = projectRenameGraph(
      { version: 1, active: activeGraphId, graphs: projectGraphs, style: get().projectStyle },
      activeGraphId,
      name,
    );
    set({ projectGraphs: project.graphs, toast: `已重命名为「${name.trim() || before.name}」` });
    saveProjectDoc(project);
  },

  removeGraph: () => {
    const { graph, projectGraphs, activeGraphId } = get();
    if (projectGraphs.length <= 1) {
      set({ toast: '至少保留一张图' });
      return;
    }
    if (typeof window !== 'undefined' && !window.confirm('删除当前图？该图的节点与连线会一起删除。')) {
      return;
    }
    const synced = syncActive(
      { version: 1, active: activeGraphId, graphs: projectGraphs, style: get().projectStyle },
      graph,
      activeGraphId,
    );
    const next = projectRemoveGraph(synced, activeGraphId);
    const active = projectActiveGraph(next);
    set({
      graph: active.graph,
      projectGraphs: next.graphs,
      activeGraphId: active.id,
      past: [],
      future: [],
      selectedNodes: [],
      selectedEdge: null,
      pendingPort: null,
      path: [],
      preview: false,
      filter: EMPTY_FILTER,
      focus: null,
      impactOn: false,
      tableSort: null,
      hiddenColumns: [],
      toast: `已删除，切换到「${active.name}」`,
    });
    saveProjectDoc(next);
  },

  saveToCache: () => {
    const { graph, projectGraphs, activeGraphId } = get();
    saveCached(graph);
    if (!projectGraphs.length) return;
    const project = syncActive(
      { version: 1, active: activeGraphId, graphs: projectGraphs, style: get().projectStyle },
      graph,
      activeGraphId,
    );
    set({ projectGraphs: project.graphs });
    saveProjectDoc(project);
  },

  dismissAssetPrompt: () => set({ assetPrompt: 0 }),
  clearFolderError: () => set({ folderError: null }),
  openNewProject: () => set({ newProjectOpen: true }),
  closeNewProject: () => set({ newProjectOpen: false }),

  newProject: () => {
    folderHandle = null;
    projectFileHandle = null;
    const blank = { ...sampleGraph(), nodes: [], edges: [] };
    const seeded = projectFromGraph(blank, '主图');
    set({
      graph: seeded.graphs[0].graph,
      projectGraphs: seeded.graphs,
      activeGraphId: seeded.active,
      projectStyle: seeded.style ?? { ...EMPTY_STYLE },
      folderName: null,
      assetPrompt: 0,
      folderError: null,
      newProjectOpen: false,
      providersOpen: false,
      generateTarget: null,
      path: [],
      preview: false,
      selectedNodes: [],
      selectedEdge: null,
      filter: EMPTY_FILTER,
      past: [],
      future: [],
      clipboard: null,
      pasteCount: 0,
      pendingPort: null,
      impactOn: false,
      tableSort: null,
      hiddenColumns: [],
      focus: null,
      toast: '已新建空白项目；用「保存 ▾ → 另存为目录项目」落盘',
    });
  },


  saveCurrentProject: () => {
    // 优先写回已绑定的项目文件夹；其次覆盖打开的单文件；都没有才选目录。
    if (!folderHandle && projectFileHandle) {
      void (async () => {
        try {
          const handle = projectFileHandle!;
          const writable = await handle.createWritable();
          await writable.write(`${JSON.stringify(get().currentProject(), null, 2)}\n`);
          await writable.close();
          get().toastOf(`已保存到「${handle.name}」`);
        } catch (error) {
          const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          console.error('save project file failed', error);
          set({ folderError: `保存到项目文件失败：${detail}` });
        }
      })();
      return;
    }
    void get().saveToFolder();
  },

  openProjectFile: async () => {
    if (typeof window === 'undefined') return;
    if (!window.showOpenFilePicker) {
      const raw = await pickGraphFile();
      if (raw !== null) get().loadFile(raw);
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Nodeworks 项目', accept: { 'application/json': ['.json'] } }],
      });
      const file = await handle.getFile();
      get().loadFile(JSON.parse(await file.text()), handle);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      get().toastOf(`打开失败：${error instanceof Error ? error.message : String(error)}`);
    }
  },

  saveToFolder: async (preset?: FileSystemDirectoryHandle) => {
    try {
      if (typeof window === 'undefined') return;
      const readResource = async (node: UnitNode, resource: ResourceItem) => {
        const cached = resourceFiles.get(`${node.id}:${resource.id}`);
        if (cached) return new Uint8Array(await cached.arrayBuffer());
        if (!resource.path) return null;
        try {
          const url = /^(data:|https?:)/i.test(resource.path)
            ? resource.path
            : new URL(resource.path, window.location.href).href;
          const response = await fetch(url);
          if (!response.ok) return null;
          return new Uint8Array(await response.arrayBuffer());
        } catch {
          return null;
        }
      };

      const bound = preset ?? folderHandle;
      const picker = window.showDirectoryPicker?.bind(window);
      if (!bound && !picker) {
        set({ folderError: '当前浏览器不支持目录访问。请用 Chrome / Edge，或直接把项目文件夹拖进窗口。' });
        return;
      }
      const handle = bound ?? (await picker!({ mode: 'readwrite' }));
      const permission = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
      if (permission !== 'granted') {
        const asked = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
        if (asked !== 'granted') {
          get().toastOf('目录写入权限被拒绝');
          return;
        }
      }
      folderHandle = handle;
      void saveFolderHandle(handle);
      set({ folderName: handle.name });
      const fsOut = new DiskFS(handle);
      await writeProject(fsOut, get().currentProject(), { readResource });
      if (!(await fsOut.exists('project.json'))) {
        throw new Error('写入完成但目录里没有 project.json（可能只读，或文件被系统拦截）');
      }
      set({ folderError: null });
      get().toastOf(bound ? `已同步到「${handle.name}」` : `已保存到「${handle.name}」· project.json`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.warn('saveToFolder aborted', error);
        get().toastOf('没有写入：选择器被取消，或被浏览器拦截（AbortError）。可重试，或把项目文件夹直接拖进窗口');
        return;
      }
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error('saveToFolder failed', error);
      set({ folderError: `保存到项目文件夹失败：${detail}` });
    }
  },

  openFolder: async () => {
    if (typeof window === 'undefined' || !window.showDirectoryPicker) {
      set({ folderError: '当前浏览器不支持目录访问。请用 Chrome / Edge，或直接把项目文件夹拖进窗口。' });
      return;
    }
    try {
      const picked = await window.showDirectoryPicker({ mode: 'readwrite' });
      await get().openDirectory(picked);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error('openFolder failed', error);
      set({ folderError: `打开文件夹失败：${detail}` });
    }
  },

  openDirectory: async (picked) => {
    try {
      let handle = picked;
      let fs = new DiskFS(handle);
      let via = '';
      if (!(await hasFolderProject(fs))) {
        // 允许用户选到项目文件夹的上一层：若唯一子目录里有 project.json，就自动下探。
        const candidates: { name: string; handle: FileSystemDirectoryHandle; fs: DiskFS }[] = [];
        for (const entry of (await fs.list('')).filter((e) => e.kind === 'directory').slice(0, 40)) {
          try {
            const sub = await handle.getDirectoryHandle(entry.name);
            const subFs = new DiskFS(sub);
            if (await hasFolderProject(subFs)) candidates.push({ name: entry.name, handle: sub, fs: subFs });
          } catch {
            /* 忽略无权限或已消失的目录 */
          }
        }
        if (candidates.length === 0) {
          set({ folderError: `「${handle.name}」里没有 project.json，直接子目录里也没找到。请选择包含 project.json 的那一层。` });
          return;
        }
        if (candidates.length > 1) {
          set({ folderError: `这个文件夹下有多个项目：${candidates.map((c) => c.name).join('、')}。请选择其中一个。` });
          return;
        }
        handle = candidates[0].handle;
        fs = candidates[0].fs;
        via = `（子目录「${candidates[0].name}」）`;
      }
      const project = await readProject(fs);
      get().load(projectActiveGraph(project).graph);
      set({
        graph: projectActiveGraph(project).graph,
        projectGraphs: project.graphs,
        activeGraphId: project.active,
        projectStyle: project.style ?? { ...EMPTY_STYLE },
        folderName: handle.name,
        fileName: null,
        assetPrompt: 0,
        folderError: null,
        toast: `已打开目录项目「${handle.name}」${via} · 共 ${project.graphs.length} 张图`,
      });
      folderHandle = handle;
      projectFileHandle = null;
      void saveFolderHandle(handle);
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error('openDirectory failed', error);
      set({ folderError: `打开文件夹失败：${detail}` });
    }
  },

  reloadFolder: async () => {
    if (!folderHandle) {
      get().toastOf('还没有绑定目录');
      return;
    }
    try {
      const project = await readProject(new DiskFS(folderHandle));
      get().load(projectActiveGraph(project).graph);
      set({
        graph: projectActiveGraph(project).graph,
        projectGraphs: project.graphs,
        activeGraphId: project.active,
        projectStyle: project.style ?? { ...EMPTY_STYLE },
        toast: '已从目录重新载入',
      });
    } catch (error) {
      get().toastOf(`重新载入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  },

  folderAssetPath: (nodeId, resource) => {
    if (!folderHandle) return null;
    const state = get();
    const node = graphOf(state).nodes.find((n) => n.id === nodeId);
    const card = state.projectGraphs.find((pg) => pg.id === state.activeGraphId)
      ?? state.projectGraphs.find((pg) => pg.graph.nodes.some((n) => n.id === nodeId));
    if (!node || !card) return null;
    const rel = resource.file ?? joinPath('resources', resourceFileName(resource));
    return joinPath('graphs', graphDirName(card.name, card.id), 'nodes', nodeDirName(node), rel);
  },

  readFolderAsset: async (nodeId, resource) => {
    if (!folderHandle) return null;
    const state = get();
    const node = graphOf(state).nodes.find((n) => n.id === nodeId);
    const card = state.projectGraphs.find((pg) => pg.id === state.activeGraphId)
      ?? state.projectGraphs.find((pg) => pg.graph.nodes.some((n) => n.id === nodeId));
    if (!node || !card) return null;
    try {
      const rel = resource.file ?? joinPath('resources', resourceFileName(resource));
      const path = joinPath('graphs', graphDirName(card.name, card.id), 'nodes', nodeDirName(node), rel);
      const bytes = await new DiskFS(folderHandle).readBytes(path);
      if (!bytes) return null;
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return new Blob([copy]);
    } catch {
      return null;
    }
  },

  unbindFolder: () => {
    folderHandle = null;
    projectFileHandle = null;
    void clearFolderHandle();
    if (folderSyncTimer) {
      clearTimeout(folderSyncTimer);
      folderSyncTimer = null;
    }
    if (get().folderName || get().fileName) set({ folderName: null, fileName: null });
  },

  currentProject: () => {
    const { graph, projectGraphs, activeGraphId, projectStyle } = get();
    if (!projectGraphs.length) return { ...projectFromGraph(graph), style: { ...projectStyle } };
    return syncActive(
      { version: 1, active: activeGraphId, graphs: projectGraphs, style: { ...projectStyle } },
      graph,
      activeGraphId,
    );
  },

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

  setOuterMap: (portId, endpoint) => {
    const state = get();
    if (!state.path.length) return;
    const parentPath = state.path.slice(0, -1);
    const nodeId = state.path[state.path.length - 1];
    const parent = graphAtPath(state.graph, parentPath);
    const node = parent?.nodes.find((n) => n.id === nodeId);
    if (!parent || !node) return;
    const beforeMap = node.subgraphMap ?? {};
    const afterMap: Record<string, Endpoint> = { ...beforeMap };
    if (endpoint) {
      const inner = node.subgraph?.nodes.find((n) => n.id === endpoint.node);
      const innerPort = inner?.ports.find((p) => p.id === endpoint.port);
      const outer = node.ports.find((p) => p.id === portId);
      if (!innerPort || !outer) {
        set({ toast: '映射端点不存在' });
        return;
      }
      if (innerPort.dir !== outer.dir) {
        set({ toast: '只能接到同方向的外层端口' });
        return;
      }
      afterMap[portId] = { ...endpoint };
    } else {
      delete afterMap[portId];
    }
    const beforeRoot = state.graph;
    const afterRoot = updateAtPath(beforeRoot, parentPath, (g) => setSubgraphMapOp(g, nodeId, afterMap));
    if (afterRoot === beforeRoot) return;
    const entry: Entry = {
      label: endpoint ? '映射外层端口' : '取消外层端口映射',
      run: () => afterRoot,
      revert: () => beforeRoot,
      at: Date.now(),
    };
    set({ graph: afterRoot, past: pushEntry(state.past, entry), future: [] });
  },

  linkCrossSubgraph: (source, target) => {
    const state = get();
    if (state.path.length !== 1) {
      set({ toast: '跨子图连线要先进入一个顶层子图，再从输出端口拖到「连接到其他子图」' });
      return;
    }
    const plan = planCrossLink(state.graph, state.path[0], source, target);
    if (!plan) {
      set({ toast: '跨子图连线失败：请检查端口方向或子图结构' });
      return;
    }
    const beforeRoot = state.graph;
    const afterRoot = plan.graph;
    const entry: Entry = {
      label: '跨子图连线',
      run: () => afterRoot,
      revert: () => beforeRoot,
      at: Date.now(),
    };
    set({
      graph: afterRoot,
      past: pushEntry(state.past, entry),
      future: [],
      toast: `已连接「${target.nodeTitle} · ${target.portLabel}」`,
    });
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
